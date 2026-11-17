import logging

import pytest

import backend.__main__ as entry
from backend import security
from backend.logging_setup import RedactingFilter


def test_filter_redacts_token_and_home(tmp_path):
    f = RedactingFilter(token="s3cr3t-token", home=r"C:\Users\kullanici")
    rec = logging.LogRecord("x", logging.INFO, __file__, 1, "token=%s yol=%s", ("s3cr3t-token",
                            r"C:\Users\kullanici\OpenGLWebIDE\workspace\p"), None)
    assert f.filter(rec)
    msg = rec.getMessage()
    assert "s3cr3t-token" not in msg and "kullanici" not in msg
    assert "***" in msg and "~" in msg


def test_filter_redacts_forward_slash_home_variant():
    f = RedactingFilter(token="t" * 40, home=r"C:\Users\kullanici")
    rec = logging.LogRecord("x", logging.INFO, __file__, 1, "C:/Users/kullanici/x", (), None)
    f.filter(rec)
    assert rec.getMessage() == "~/x"


def test_filter_keeps_args_for_uvicorn_access_formatter():
    from uvicorn.logging import AccessFormatter
    f = RedactingFilter(token="t" * 40, home=r"C:\Users\kullanici")
    rec = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
                            ("127.0.0.1:5000", "GET", "/api/x?q=" + "t" * 40, "1.1", 401), None)
    assert f.filter(rec)
    line = AccessFormatter(fmt="%(client_addr)s %(request_line)s %(status_code)s", use_colors=False).format(rec)
    assert "t" * 40 not in line and "401" in line


def test_main_refuses_admin(monkeypatch, capsys):
    monkeypatch.setattr(security, "is_admin", lambda: True)
    started = []
    monkeypatch.setattr(entry, "serve", lambda *a, **k: started.append(1))
    assert entry.main(["--port", "8799"]) == 1
    assert started == []
    assert "Yönetici" in capsys.readouterr().err


def test_main_binds_loopback_and_prints_fragment_url(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    captured = {}
    monkeypatch.setattr(entry, "serve", lambda app, settings: captured.update(settings=settings))
    assert entry.main(["--port", "8799", "--workspace", str(tmp_path)]) == 0
    s = captured["settings"]
    assert (s.host, s.port) == ("127.0.0.1", 8799)
    out = capsys.readouterr().out
    assert f"http://127.0.0.1:8799/#token={s.token}" in out
    assert "?token" not in out


def test_main_serves_built_frontend_and_prints_dev_url(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("x")
    monkeypatch.setattr(entry, "FRONTEND_DIST", dist)
    captured = {}
    monkeypatch.setattr(entry, "serve", lambda app, settings: captured.update(settings=settings))
    entry.main(["--workspace", str(tmp_path), "--dev-origin", "http://127.0.0.1:5173"])
    s = captured["settings"]
    assert s.frontend_dist == dist
    assert f"http://127.0.0.1:5173/#token={s.token}" in capsys.readouterr().out


def test_main_without_built_frontend_warns(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    monkeypatch.setattr(entry, "FRONTEND_DIST", tmp_path / "yok")
    captured = {}
    monkeypatch.setattr(entry, "serve", lambda app, settings: captured.update(settings=settings))
    entry.main(["--workspace", str(tmp_path)])
    assert captured["settings"].frontend_dist is None
    assert "npm run build" in capsys.readouterr().err


def test_open_flag_opens_browser_with_token_url(monkeypatch, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    captured, opened = {}, []
    monkeypatch.setattr(entry, "serve", lambda app, settings: captured.update(settings=settings))
    monkeypatch.setattr(entry, "open_browser_later", lambda url: opened.append(url))
    entry.main(["--workspace", str(tmp_path), "--port", "8798", "--open"])
    assert opened == [f"http://127.0.0.1:8798/#token={captured['settings'].token}"]


def test_browser_not_opened_without_flag(monkeypatch, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    opened = []
    monkeypatch.setattr(entry, "serve", lambda app, settings: None)
    monkeypatch.setattr(entry, "open_browser_later", lambda url: opened.append(url))
    entry.main(["--workspace", str(tmp_path)])
    assert opened == []


def test_dev_origin_must_be_loopback(monkeypatch, tmp_path):
    monkeypatch.setattr(security, "is_admin", lambda: False)
    monkeypatch.setattr(entry, "serve", lambda app, settings: None)
    with pytest.raises(SystemExit):
        entry.main(["--workspace", str(tmp_path), "--dev-origin", "https://evil.com"])
