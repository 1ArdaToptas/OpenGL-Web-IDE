from pathlib import Path

from engine.diagnostics import Diagnostic, parse_diagnostics

PROJ = Path("D:/ws/ucgen")

GCC_OUTPUT = """\
[1/3] Building C object CMakeFiles/app.dir/D_/ws/ucgen/src/main.c.obj
FAILED: CMakeFiles/app.dir/D_/ws/ucgen/src/main.c.obj
D:/ws/ucgen/src/main.c: In function 'display':
D:/ws/ucgen/src/main.c:12:5: error: 'glBegn' undeclared (first use in this function); did you mean 'glBegin'?
   12 |     glBegn(GL_TRIANGLES);
      |     ^~~~~~
D:/ws/ucgen/src/main.c:12:5: note: each undeclared identifier is reported only once
D:/ws/ucgen/src/util.h:3:10: warning: unused variable 'x' [-Wunused-variable]
D:/ws/ucgen/src/main.c:1:10: fatal error: GL/glutt.h: No such file or directory
ninja: build stopped: subcommand failed.
"""

LINK_OUTPUT = """\
[2/2] Linking C executable app.exe
C:/msys64/ucrt64/bin/../lib/gcc/x86_64-w64-mingw32/16.2.0/../../../../x86_64-w64-mingw32/bin/ld.exe: CMakeFiles/app.dir/D_/ws/ucgen/src/main.c.obj: in function `main':
D:/ws/ucgen/src/main.c:40:(.text+0x1a): undefined reference to `glutInitt'
collect2.exe: error: ld returned 1 exit status
"""


def test_compiler_error_with_line_and_column():
    d = parse_diagnostics(GCC_OUTPUT, PROJ)
    assert d[0] == Diagnostic(file="src/main.c", line=12, col=5, severity="error",
                              message="'glBegn' undeclared (first use in this function); did you mean 'glBegin'?")


def test_severities_note_warning_fatal():
    sev = [(x.file, x.line, x.severity) for x in parse_diagnostics(GCC_OUTPUT, PROJ)]
    assert ("src/main.c", 12, "note") in sev
    assert ("src/util.h", 3, "warning") in sev
    assert ("src/main.c", 1, "error") in sev  # fatal error -> error


def test_context_lines_are_not_diagnostics():
    assert len(parse_diagnostics(GCC_OUTPUT, PROJ)) == 4


def test_linker_undefined_reference_maps_to_source_line():
    d = parse_diagnostics(LINK_OUTPUT, PROJ)
    assert Diagnostic(file="src/main.c", line=40, col=0, severity="error",
                      message="undefined reference to `glutInitt'") in d


def test_linker_summary_is_error_without_location():
    d = parse_diagnostics(LINK_OUTPUT, PROJ)
    assert Diagnostic(file="", line=0, col=0, severity="error", message="ld returned 1 exit status") in d


def test_files_outside_project_keep_absolute_path():
    out = "C:/msys64/ucrt64/include/GL/freeglut_std.h:5:1: warning: something\n"
    assert parse_diagnostics(out, PROJ)[0].file == "C:/msys64/ucrt64/include/GL/freeglut_std.h"


def test_windows_backslash_paths_are_normalized():
    out = "D:\\ws\\ucgen\\src\\main.c:7:3: error: expected ';' before '}' token\n"
    d = parse_diagnostics(out, PROJ)[0]
    assert (d.file, d.line, d.col) == ("src/main.c", 7, 3)


def test_crlf_output():
    out = "D:/ws/ucgen/src/main.c:2:1: error: x\r\n"
    assert parse_diagnostics(out, PROJ)[0].message == "x"
