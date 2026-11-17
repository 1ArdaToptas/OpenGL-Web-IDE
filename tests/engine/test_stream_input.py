import pytest

from engine.stream import input as stream_input


@pytest.fixture
def posted(monkeypatch):
    calls = []
    monkeypatch.setattr(stream_input, "_post", lambda hwnd, msg, wparam, lparam: calls.append((msg, wparam, lparam)))
    return calls


def test_key_is_posted_as_wm_char(posted):
    stream_input.apply_input(123, {"type": "key", "key": "a"}, (800, 600))
    assert posted == [(stream_input.WM_CHAR, ord("a"), 0)]


def test_click_posts_down_and_up_with_packed_coordinates(posted):
    stream_input.apply_input(123, {"type": "click", "x": 10.7, "y": 20.2}, (800, 600))
    lparam = (20 << 16) | 10
    assert posted == [(stream_input.WM_LBUTTONDOWN, stream_input.MK_LBUTTON, lparam),
                      (stream_input.WM_LBUTTONUP, 0, lparam)]


def test_click_coordinates_are_clamped_to_window(posted):
    stream_input.apply_input(123, {"type": "click", "x": -50, "y": 99999}, (800, 600))
    assert posted[0][2] == (599 << 16) | 0


@pytest.mark.parametrize("msg", [
    {"type": "key", "key": "ab"}, {"type": "key", "key": ""}, {"type": "key", "key": 65},
    {"type": "key", "key": "\x00"}, {"type": "click", "x": "1", "y": 2}, {"type": "click", "x": 1},
    {"type": "click", "x": float("nan"), "y": 1}, {"type": "close"}, {"type": "key"}, [], "x", None,
])
def test_invalid_messages_are_rejected_without_posting(posted, msg):
    with pytest.raises(ValueError):
        stream_input.apply_input(123, msg, (800, 600))
    assert posted == []
