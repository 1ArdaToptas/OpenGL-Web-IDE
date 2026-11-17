"""API girdi şemaları (SR-10). Bilinmeyen alanlar reddedilir."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectCreate(Strict):
    name: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
    profile: Literal["legacy", "modern"]
    example: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")


class FileWrite(Strict):
    content: str


class BuildRequest(Strict):
    config: Literal["Debug", "Release"] = "Debug"
    c_std: Literal["11", "17"] = "17"
    cxx_std: Literal["17", "20"] = "17"
    warnings: Literal["default", "all", "extra"] = "extra"


class RunRequest(Strict):
    timeout_s: float | None = Field(default=None, gt=0, le=3600)
    test_frames: int | None = Field(default=None, ge=1, le=100_000)
