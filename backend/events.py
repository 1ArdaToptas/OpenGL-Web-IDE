"""Proje bazlı olay yayını.

publish() herhangi bir iş parçacığından çağrılabilir: her abone kendi event loop'unda,
call_soon_threadsafe ile ve yayın sırasıyla (FIFO) beslenir.
"""
import asyncio
import threading
from collections import defaultdict


class EventHub:
    def __init__(self, queue_size: int = 5000):
        self.queue_size = queue_size
        self._lock = threading.Lock()
        self._subs: dict[str, dict[asyncio.Queue, asyncio.AbstractEventLoop]] = defaultdict(dict)

    def subscribe(self, project: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(self.queue_size)
        with self._lock:
            self._subs[project][q] = asyncio.get_running_loop()
        return q

    def unsubscribe(self, project: str, q: asyncio.Queue) -> None:
        with self._lock:
            self._subs[project].pop(q, None)

    def publish(self, project: str, event: dict) -> None:
        with self._lock:
            targets = list(self._subs[project].items())
        for q, loop in targets:
            try:
                loop.call_soon_threadsafe(self._put, q, event)
            except RuntimeError:  # loop kapanmış
                self.unsubscribe(project, q)

    @staticmethod
    def _put(q: asyncio.Queue, event: dict) -> None:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # yavaş istemci: olay düşürülür, servis bloklanmaz
