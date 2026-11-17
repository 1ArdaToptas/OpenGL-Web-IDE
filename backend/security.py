"""Token, Host ve Origin denetimi (SR-02, SR-03) ve yönetici olarak çalıştırma reddi (SR-09)."""
import ctypes
import hmac
import secrets

from starlette.datastructures import Headers
from starlette.requests import ClientDisconnect
from starlette.responses import JSONResponse

from .config import Settings


class RunningAsAdminError(RuntimeError):
    pass


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def token_matches(candidate: str | None, settings: Settings) -> bool:
    return bool(candidate) and hmac.compare_digest(candidate.encode(), settings.token.encode())


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except (AttributeError, OSError):
        return False


def ensure_not_admin() -> None:
    if is_admin():
        raise RunningAsAdminError("Yönetici olarak çalıştırılamaz; normal kullanıcı hesabıyla başlatın.")


def _hostname(host: str) -> str:
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def content_security_policy(settings: Settings) -> str:
    ws = " ".join(f"ws://{h}:{settings.port}" for h in ("127.0.0.1", "localhost"))
    # Monaco çalışma anında <style> ekler; bu yüzden style-src 'unsafe-inline'. Betikler yalnızca kendi origin'den.
    return "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "worker-src 'self' blob:",
        "img-src 'self' data:",
        "font-src 'self' data:",
        f"connect-src 'self' {ws}",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ])


class SecurityHeadersMiddleware:
    """Tüm HTTP yanıtlarına güvenlik başlıkları (statik arayüz dahil)."""

    def __init__(self, app, settings: Settings):
        self.app = app
        self.headers = [
            (b"content-security-policy", content_security_policy(settings).encode()),
            (b"x-content-type-options", b"nosniff"),
            (b"referrer-policy", b"no-referrer"),
            (b"cache-control", b"no-store"),
        ]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = [*message.get("headers", []),
                                      *((k, v) for k, v in self.headers if k not in existing)]
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodyLimitMiddleware:
    """İstek gövdesini uygulamaya ulaşmadan sınırlar (Content-Length ve parça parça gelen gövde)."""

    def __init__(self, app, settings: Settings):
        self.app, self.limit = app, settings.max_request_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        declared = Headers(scope=scope).get("content-length")
        if declared and declared.isdigit() and int(declared) > self.limit:
            return await self._too_large(scope, receive, send)

        received, responded = 0, False

        async def guarded_send(message):
            if not responded:
                await send(message)

        async def limited_receive():
            # FastAPI gövde okuma istisnalarını 400'e çevirir; bu yüzden 413 doğrudan gönderilir ve
            # uygulamaya bağlantı kopması bildirilir, sonraki yanıt denemeleri yutulur.
            nonlocal received, responded
            if responded:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    responded = True
                    await self._too_large(scope, receive, send)
                    return {"type": "http.disconnect"}
            return message

        try:
            await self.app(scope, limited_receive, guarded_send)
        except ClientDisconnect:
            if not responded:
                raise

    @staticmethod
    async def _too_large(scope, receive, send):
        await JSONResponse({"detail": "İstek çok büyük"}, status_code=413)(scope, receive, send)


class SecurityMiddleware:
    """Saf ASGI: HTTP ve WebSocket için Host/Origin; /api için Bearer token."""

    def __init__(self, app, settings: Settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        origin = headers.get("origin")

        if _hostname(headers.get("host", "")) not in self.settings.allowed_hosts:
            return await self._reject(scope, receive, send, 400, "Geçersiz Host")
        if origin is not None and origin not in self.settings.origins:
            return await self._reject(scope, receive, send, 403, "İzinsiz Origin")
        if scope["type"] == "http" and scope["path"].startswith("/api") and scope["method"] != "OPTIONS":
            auth = headers.get("authorization", "")
            scheme, _, token = auth.partition(" ")
            if scheme.lower() != "bearer" or not token_matches(token, self.settings):
                return await self._reject(scope, receive, send, 401, "Yetkisiz")
        await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope, receive, send, status: int, message: str):
        if scope["type"] == "websocket":
            await receive()  # websocket.connect
            await send({"type": "websocket.close", "code": 4000 + status, "reason": message})
            return
        await JSONResponse({"detail": message}, status_code=status)(scope, receive, send)
