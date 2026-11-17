import shutil

from fastapi import APIRouter, HTTPException, Request, Response

from engine.project import BuildSettings, Profile, ProjectExistsError, create_project, list_examples
from engine.toolchain import ToolchainError

from .jobs import run_limits
from .schemas import BuildRequest, FileWrite, ProjectCreate, RunRequest
from .workspace import Workspace

router = APIRouter(prefix="/api")


def _ws(request: Request) -> Workspace:
    return request.app.state.workspace


@router.get("/projects")
def list_projects(request: Request):
    return [{"name": p.name, "profile": p.profile.value} for p in _ws(request).list_projects()]


@router.get("/examples")
def examples(request: Request):
    return [{"id": e.id, "profile": e.profile.value, "title": e.title, "description": e.description, "kind": e.kind}
            for e in list_examples(request.app.state.settings.templates_dir)]


@router.post("/projects", status_code=201)
def new_project(body: ProjectCreate, request: Request):
    ws = _ws(request)
    try:
        p = create_project(ws.root, body.name, Profile(body.profile), request.app.state.settings.templates_dir,
                           example=body.example)
    except ProjectExistsError as e:
        raise HTTPException(409, str(e)) from e
    return {"name": p.name, "profile": p.profile.value}


@router.delete("/projects/{name}", status_code=204)
def delete_project(name: str, request: Request):
    project_dir = _ws(request).project_dir(name)
    request.app.state.jobs.ensure_idle(name)
    shutil.rmtree(project_dir)
    return Response(status_code=204)


@router.get("/projects/{name}/tree")
def tree(name: str, request: Request):
    return _ws(request).tree(name)


@router.get("/projects/{name}/files/{rel:path}")
def read_file(name: str, rel: str, request: Request):
    path = _ws(request).file_path(name, rel)
    if not path.is_file():
        raise HTTPException(404, "Dosya bulunamadı")
    try:
        content = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(415, "Dosya UTF-8 metin değil") from e
    return {"path": rel, "content": content}


@router.put("/projects/{name}/files/{rel:path}")
def write_file(name: str, rel: str, body: FileWrite, request: Request):
    path = _ws(request).file_path(name, rel)
    data = body.content.encode("utf-8")
    if len(data) > request.app.state.settings.max_file_bytes:
        raise HTTPException(413, "Dosya çok büyük")
    if path.is_dir():
        raise HTTPException(400, "Bu yol bir dizin")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"path": rel, "size": len(data)}


def _toolchain(request: Request):
    try:
        return request.app.state.toolchain.get()
    except ToolchainError as e:
        raise HTTPException(503, {"message": "Derleme araçları eksik", "missing": e.missing}) from e


@router.post("/projects/{name}/build", status_code=202)
async def build(name: str, body: BuildRequest, request: Request):
    project = _ws(request).project(name)
    tc = _toolchain(request)
    settings = BuildSettings(**body.model_dump())
    job_id = request.app.state.jobs.start_build(project, tc, settings, request.app.state.settings.templates_dir)
    return {"jobId": job_id}


@router.post("/projects/{name}/run", status_code=202)
async def run(name: str, body: RunRequest, request: Request):
    project = _ws(request).project(name)
    tc = _toolchain(request)
    if not project.executable.is_file():
        raise HTTPException(409, "Önce derleyin")
    limits = run_limits(request.app.state.settings.run_limits, body.timeout_s)
    return {"jobId": request.app.state.jobs.start_run(project, tc, limits, body.test_frames)}


@router.post("/jobs/{job_id}/stop", status_code=204)
def stop_job(job_id: str, request: Request):
    request.app.state.jobs.stop(job_id)
    return Response(status_code=204)


@router.delete("/projects/{name}/files/{rel:path}", status_code=204)
def delete_file(name: str, rel: str, request: Request):
    path = _ws(request).file_path(name, rel)
    if not path.is_file():
        raise HTTPException(404, "Dosya bulunamadı")
    path.unlink()
    return Response(status_code=204)
