import asyncio
import json
import logging

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from engine.project import InvalidProjectError
from engine.toolchain import Toolchain, ToolchainError, detect

from .api import router
from .config import Settings
from .events import EventHub
from .jobs import JobManager, default_build_factory, default_run_factory
from .stream import StreamSession, StreamUnavailable
from .stream import availability as stream_availability
from .security import BodyLimitMiddleware, SecurityHeadersMiddleware, SecurityMiddleware, token_matches
from .workspace import PathRejected, ProjectNotFound, Workspace

WS_AUTH_TIMEOUT_S = 5
STREAM_SDP_MAX = 64_000
log = logging.getLogger(__name__)


class ToolchainProvider:
    """Başarılı tespit önbelleğe alınır; eksikse her istekte yeniden denenir (kullanıcı sonradan kurabilir)."""

    def __init__(self, msys2_root):
        self.msys2_root = msys2_root
        self._cached: Toolchain | None = None

    def get(self) -> Toolchain:
        if self._cached is None:
            self._cached = detect(self.msys2_root)
        return self._cached

    def status(self) -> dict:
        try:
            tc = self.get()
            return {"ok": True, "missing": [], "versions": tc.versions}
        except ToolchainError as e:
            return {"ok": False, "missing": e.missing, "versions": {}}


def create_app(settings: Settings, toolchain=None, build_factory=default_build_factory,
               run_factory=default_run_factory, stream_factory=StreamSession,
               window_wait_s: float = 5.0) -> FastAPI:
    app = FastAPI(title="OpenGL Web IDE", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.toolchain = toolchain or ToolchainProvider(settings.msys2_root)
    settings.workspace_root.mkdir(parents=True, exist_ok=True)
    app.state.workspace = Workspace(settings.workspace_root)
    app.state.hub = EventHub()
    app.state.jobs = JobManager(app.state.hub, settings.max_active_jobs, build_factory, run_factory)
    app.include_router(router)

    @app.exception_handler(PathRejected)
    async def _path_rejected(request: Request, exc: PathRejected):
        status = 404 if isinstance(exc, ProjectNotFound) else 400
        return JSONResponse({"detail": str(exc)}, status_code=status)

    @app.exception_handler(InvalidProjectError)
    async def _invalid_project(request: Request, exc: InvalidProjectError):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.get("/api/health")
    def health():
        return {"version": "0.1.0", "toolchain": app.state.toolchain.status(), "stream": stream_availability()}

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        try:
            msg = json.loads(await asyncio.wait_for(ws.receive_text(), WS_AUTH_TIMEOUT_S))
        except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
            return await ws.close(code=4401)
        if not isinstance(msg, dict) or msg.get("type") != "auth" or not token_matches(msg.get("token"), settings):
            return await ws.close(code=4401)

        project = ws.query_params.get("project")
        if project is None:
            await ws.send_json({"type": "ready"})
            return await _drain(ws)
        try:
            app.state.workspace.project_dir(project)
        except PathRejected:
            return await ws.close(code=4404)

        queue = app.state.hub.subscribe(project)
        streams = _StreamHolder()
        try:
            await ws.send_json({"type": "ready", "project": project, "activeJob": app.state.jobs.active(project)})
            sender = asyncio.create_task(_forward(queue, ws, streams))
            await _client_messages(ws, project, streams)
            sender.cancel()
        finally:
            app.state.hub.unsubscribe(project, queue)
            await streams.close()

    async def _client_messages(ws: WebSocket, project: str, streams: "_StreamHolder") -> None:
        """İstemciden yalnızca `stream.offer` beklenir; diğer/bozuk mesajlar yok sayılır."""
        try:
            while True:
                try:
                    msg = json.loads(await ws.receive_text())
                except ValueError:
                    continue
                if isinstance(msg, dict) and msg.get("type") == "stream.offer":
                    reply = await _start_stream(project, msg, streams)
                    await ws.send_json(reply)
        except WebSocketDisconnect:
            pass

    async def _start_stream(project: str, msg: dict, streams: "_StreamHolder") -> dict:
        sdp, sdp_type = msg.get("sdp"), msg.get("sdp_type")
        if not isinstance(sdp, str) or len(sdp) > STREAM_SDP_MAX or sdp_type != "offer":
            return {"type": "stream.error", "message": "Geçersiz görüntü isteği"}
        hwnd = None
        deadline = asyncio.get_running_loop().time() + window_wait_s
        while True:
            program = app.state.jobs.running_program(project)
            if program is None:
                return {"type": "stream.error", "message": "Çalışan program yok. Önce Çalıştır'a basın."}
            if hwnd := program.find_window():
                break
            if asyncio.get_running_loop().time() >= deadline:
                return {"type": "stream.error",
                        "message": "Program penceresi bulunamadı (pencere açmayan bir program olabilir)."}
            await asyncio.sleep(0.1)
        await streams.close()
        try:
            session = stream_factory(hwnd)
            streams.session = session
            answer = await session.answer(sdp, sdp_type)
        except StreamUnavailable as e:
            return {"type": "stream.error", "message": str(e)}
        except Exception:
            log.exception("Görüntü akışı başlatılamadı")
            await streams.close()
            return {"type": "stream.error", "message": "Görüntü akışı başlatılamadı"}
        return {"type": "stream.answer", **answer}

    if settings.frontend_dist:
        # En son bağlanır: /api ve /ws rotalarından sonra kalan her şey derlenmiş arayüzdür.
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")

    app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins), allow_methods=["*"],
                       allow_headers=["authorization", "content-type"])
    app.add_middleware(BodyLimitMiddleware, settings=settings)
    app.add_middleware(SecurityHeadersMiddleware, settings=settings)
    app.add_middleware(SecurityMiddleware, settings=settings)
    return app


class _StreamHolder:
    """WS bağlantısı başına en fazla bir görüntü oturumu."""

    def __init__(self):
        self.session = None

    async def close(self) -> None:
        session, self.session = self.session, None
        if session:
            await session.close()


async def _forward(queue: asyncio.Queue, ws: WebSocket, streams: _StreamHolder) -> None:
    while True:
        event = await queue.get()
        await ws.send_json(event)
        if event.get("type") == "job.exited" and event.get("kind") == "run":
            await streams.close()  # program bitti: akış da biter


async def _drain(ws: WebSocket) -> None:
    """İstemciden mesaj beklenmez; bağlantı kopana kadar gelenler yok sayılır."""
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
