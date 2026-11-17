"""Derleme/çalıştırma işleri: proje başına tek aktif iş, global üst sınır, olayları EventHub'a köprüleme.

Motor işleri eşzamanlıdır; her biri kendi iş parçacığında çalışır. EventHub.publish iş parçacığı güvenlidir.
"""
import logging
import threading
import uuid
from dataclasses import asdict, dataclass, replace
from typing import Callable

from fastapi import HTTPException

from engine.build import BuildJob
from engine.project import BuildSettings, Project
from engine.run import RunJob
from engine.sandbox import Limits

from .events import EventHub

log = logging.getLogger(__name__)


def default_build_factory(project, tc, settings, templates_dir, on_output):
    return BuildJob(project, tc, settings, templates_dir, on_output=on_output)


def default_run_factory(project, tc, on_output, limits, test_frames):
    return RunJob(project, tc, on_output=on_output, limits=limits, test_frames=test_frames)


@dataclass
class ActiveJob:
    job_id: str
    project: str
    kind: str  # build | run
    engine_job: object


class JobManager:
    def __init__(self, hub: EventHub, max_active: int, build_factory: Callable = default_build_factory,
                 run_factory: Callable = default_run_factory):
        self.hub, self.max_active = hub, max_active
        self.build_factory, self.run_factory = build_factory, run_factory
        self._lock = threading.Lock()
        self._by_project: dict[str, ActiveJob] = {}
        self._by_id: dict[str, ActiveJob] = {}

    def ensure_idle(self, project: str) -> None:
        with self._lock:
            if project in self._by_project:
                raise HTTPException(409, "Projede çalışan bir iş var")

    def active(self, project: str) -> dict | None:
        with self._lock:
            job = self._by_project.get(project)
            return {"jobId": job.job_id, "kind": job.kind} if job else None

    def running_program(self, project: str):
        """Projede çalışan programın motor işi (yalnız `run`), yoksa None."""
        with self._lock:
            job = self._by_project.get(project)
            return job.engine_job if job and job.kind == "run" else None

    def stop(self, job_id: str) -> None:
        with self._lock:
            job = self._by_id.get(job_id)
        if job is None:
            raise HTTPException(404, "İş bulunamadı")
        job.engine_job.stop()

    def start_build(self, project: Project, tc, settings: BuildSettings, templates_dir) -> str:
        return self._start(project, "build", lambda out: self.build_factory(project, tc, settings, templates_dir, out))

    def start_run(self, project: Project, tc, limits: Limits, test_frames: int | None) -> str:
        return self._start(project, "run", lambda out: self.run_factory(project, tc, out, limits, test_frames))

    def _start(self, project: Project, kind: str, make: Callable) -> str:
        name, job_id = project.name, uuid.uuid4().hex

        def emit(event: dict) -> None:
            self.hub.publish(name, event)

        def on_output(stream: str, text: str) -> None:
            emit({"type": "job.output", "jobId": job_id, "stream": stream, "data": text})

        with self._lock:
            if name in self._by_project:
                raise HTTPException(409, "Projede çalışan bir iş var")
            if len(self._by_project) >= self.max_active:
                raise HTTPException(429, "Çok fazla eşzamanlı iş")
            job = ActiveJob(job_id, name, kind, make(on_output))
            self._by_project[name] = self._by_id[job_id] = job

        emit({"type": "job.started", "jobId": job_id, "kind": kind})
        threading.Thread(target=self._execute, args=(job, emit), daemon=True, name=f"job-{kind}-{name}").start()
        return job_id

    def _execute(self, job: ActiveJob, emit: Callable[[dict], None]) -> None:
        exited = {"type": "job.exited", "jobId": job.job_id, "kind": job.kind}
        try:
            outcome = job.engine_job.run()
            result = outcome.result if job.kind == "build" else outcome
            if job.kind == "build":
                emit({"type": "build.diagnostics", "jobId": job.job_id,
                      "items": [asdict(d) for d in outcome.diagnostics]})
                exited["ok"] = outcome.ok
            exited.update(code=result.exit_code, reason=result.reason, durationMs=result.duration_ms,
                          outputTruncated=result.output_truncated, limit=result.limit)
        except Exception:
            log.exception("İş beklenmedik şekilde sonlandı: %s", job.kind)
            exited.update(code=-1, reason="error", durationMs=0, outputTruncated=False, limit=None, ok=False)
        finally:
            with self._lock:
                self._by_project.pop(job.project, None)
                self._by_id.pop(job.job_id, None)
            emit(exited)


def run_limits(base: Limits, timeout_s: float | None) -> Limits:
    return replace(base, timeout_s=timeout_s) if timeout_s else base
