"""Loglarda token ve kullanıcı ev dizininin gizlenmesi (SR-11)."""
import logging

LOGGERS = ("", "uvicorn", "uvicorn.error", "uvicorn.access", "backend", "engine")


class RedactingFilter(logging.Filter):
    def __init__(self, token: str, home: str):
        super().__init__()
        self.token = token
        self.homes = {home, home.replace("\\", "/")} if home else set()

    def _redact(self, text: str) -> str:
        text = text.replace(self.token, "***")
        for h in self.homes:
            text = text.replace(h, "~")
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        # args yapısı korunur: uvicorn AccessFormatter onu 5 elemanlı demet olarak okur.
        if isinstance(record.msg, str):
            record.msg = self._redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(self._redact(a) if isinstance(a, str) else a for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: self._redact(v) if isinstance(v, str) else v for k, v in record.args.items()}
        return True


def install(token: str, home: str) -> None:
    """Mevcut tüm handler'lara filtre ekler (uvicorn yapılandırmasından sonra çağrılmalı)."""
    f = RedactingFilter(token, home)
    for name in LOGGERS:
        for handler in logging.getLogger(name).handlers:
            handler.addFilter(f)
