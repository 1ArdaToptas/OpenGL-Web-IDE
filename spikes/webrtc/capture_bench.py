"""Yakalama ölçümü: programı motorla (Low IL) başlatır, penceresini N kez yakalar.

Kullanım: python -m spikes.webrtc.capture_bench <proje_dizini> <pencere_başlığı> <beklenen_r,g,b>
"""
import hashlib
import statistics
import sys
import threading
import time
from pathlib import Path

from engine.project import load_project
from engine.run import RunJob
from engine.sandbox import Limits
from engine.toolchain import detect

from .capture import WindowCapture, find_window


def main():
    project_dir, title, expected = Path(sys.argv[1]), sys.argv[2], tuple(map(int, sys.argv[3].split(",")))
    job = RunJob(load_project(project_dir), detect(Path(r"C:\msys64"), check_versions=False),
                 on_output=lambda s, t: None, limits=Limits(timeout_s=60))
    threading.Thread(target=job.run, daemon=True).start()

    deadline = time.monotonic() + 10
    while not (hwnd := find_window(title)) and time.monotonic() < deadline:
        time.sleep(0.05)
    time.sleep(0.5)
    cap = WindowCapture(hwnd)
    print(f"istemci alanı: {cap.width}x{cap.height}, integrity={job.integrity_level}")

    times, hashes, frames = [], [], 180
    t_start = time.perf_counter()
    for _ in range(frames):
        t0 = time.perf_counter()
        frame = cap.grab()
        times.append((time.perf_counter() - t0) * 1000)
        hashes.append(hashlib.blake2b(frame, digest_size=8).digest())
    elapsed = time.perf_counter() - t_start
    center = cap.pixel(frame, cap.width // 2, cap.height // 2)
    changed = sum(1 for a, b in zip(hashes, hashes[1:]) if a != b)
    black = all(v < 8 for v in center)
    cap.close()
    job.stop()

    print(f"grab ms: ort={statistics.mean(times):.2f} p95={sorted(times)[int(len(times) * .95)]:.2f} "
          f"max={max(times):.2f}")
    print(f"yakalama hızı: {frames / elapsed:.0f} kare/sn; değişen kare oranı: {changed / (frames - 1):.0%} "
          f"(~{changed / elapsed:.0f} farklı kare/sn)")
    ok = all(abs(a - b) <= 8 for a, b in zip(center, expected))
    print(f"merkez piksel {center} beklenen {expected} -> {'DOĞRU' if ok else 'YANLIŞ'}{' (SİYAH)' if black else ''}")


if __name__ == "__main__":
    main()
