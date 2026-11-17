import json

import pytest

from engine.project import (BuildSettings, InvalidProjectError, Profile, ProjectExistsError, create_project,
                            list_examples,
                            load_project, validate_project_name)


@pytest.mark.parametrize("name", ["ucgen", "Odev_1", "proje-2", "a", "x" * 64])
def test_valid_project_names(name):
    assert validate_project_name(name) == name


@pytest.mark.parametrize("name", ["", " ", "a b", "../x", "..", "a/b", "a\\b", "a;calc", "a&&b", "$(x)",
                                  "-a", ".gizli", "x" * 65, "CON", "nul", "Com1", "LPT9", "ç", "a:b"])
def test_invalid_project_names_rejected(name):
    with pytest.raises(InvalidProjectError):
        validate_project_name(name)


def test_create_legacy_project_copies_only_user_sources(tmp_path, templates_dir):
    proj = create_project(tmp_path, "ucgen", Profile.LEGACY, templates_dir)
    assert proj.dir == tmp_path / "ucgen"
    assert (proj.dir / "src" / "main.c").is_file()
    assert not (proj.dir / "shaders").exists()
    assert not (proj.dir / "CMakeLists.txt").exists()
    assert json.loads((proj.dir / "project.json").read_text("utf-8"))["profile"] == "legacy"


def test_create_modern_project_has_shaders_but_no_vendored_code(tmp_path, templates_dir):
    proj = create_project(tmp_path, "kare", Profile.MODERN, templates_dir)
    assert (proj.dir / "shaders" / "basic.vert").is_file()
    assert (proj.dir / "shaders" / "basic.frag").is_file()
    assert not (proj.dir / "third_party").exists()
    assert not (proj.dir / "CMakeLists.txt").exists()


def test_create_existing_project_fails(tmp_path, templates_dir):
    create_project(tmp_path, "p", Profile.LEGACY, templates_dir)
    with pytest.raises(ProjectExistsError):
        create_project(tmp_path, "p", Profile.MODERN, templates_dir)


def test_create_rejects_invalid_name_before_touching_disk(tmp_path, templates_dir):
    with pytest.raises(InvalidProjectError):
        create_project(tmp_path, "../kacis", Profile.LEGACY, templates_dir)
    assert list(tmp_path.parent.glob("kacis")) == []


def test_load_project_reads_profile(tmp_path, templates_dir):
    create_project(tmp_path, "m", Profile.MODERN, templates_dir)
    assert load_project(tmp_path / "m").profile is Profile.MODERN


def test_load_project_with_unknown_profile_fails(tmp_path):
    d = tmp_path / "bozuk"
    d.mkdir()
    (d / "project.json").write_text('{"profile": "vulkan"}', "utf-8")
    with pytest.raises(InvalidProjectError):
        load_project(d)


def test_examples_cover_static_and_animated_for_each_profile(templates_dir):
    examples = list_examples(templates_dir)
    by_profile = {p: {e.kind for e in examples if e.profile is p} for p in Profile}
    assert by_profile[Profile.LEGACY] == {"animasyon", "statik"}
    assert by_profile[Profile.MODERN] == {"animasyon", "statik"}
    assert all(e.title and e.description for e in examples)


def test_default_example_is_listed_first_per_profile(templates_dir):
    first = {}
    for e in list_examples(templates_dir):
        first.setdefault(e.profile, e.id)
    assert first == {Profile.LEGACY: "baslangic", Profile.MODERN: "baslangic"}


def test_create_from_example_copies_its_sources(tmp_path, templates_dir):
    proj = create_project(tmp_path, "s", Profile.LEGACY, templates_dir, example="sekiller")
    assert "glPolygonMode" in (proj.dir / "src" / "main.c").read_text("utf-8")
    assert not (proj.dir / "example.json").exists()


def test_required_legacy_api_is_covered_by_examples(templates_dir):
    required = ["glBegin", "glEnd", "glVertex2f", "glVertex3f", "glColor3f", "glColor4f", "glClearColor",
                "glMatrixMode", "glLoadIdentity", "glTranslatef", "glRotatef", "glScalef", "glOrtho", "glLineWidth",
                "glPointSize", "glPolygonMode", "glFlush", "glutInit", "glutCreateWindow", "glutDisplayFunc",
                "glutTimerFunc"]
    sources = "".join(p.read_text("utf-8") for p in (templates_dir / "legacy-freeglut").rglob("*.c"))
    assert [f for f in required if f + "(" not in sources] == []


@pytest.mark.parametrize("example", ["yok", "../baslangic", "kup"])  # kup modern'e ait
def test_unknown_or_foreign_example_is_rejected(tmp_path, templates_dir, example):
    with pytest.raises(InvalidProjectError):
        create_project(tmp_path, "x", Profile.LEGACY, templates_dir, example=example)
    assert not (tmp_path / "x").exists()


def test_build_settings_defaults():
    s = BuildSettings()
    assert (s.config, s.c_std, s.cxx_std, s.warnings) == ("Debug", "17", "17", "extra")


@pytest.mark.parametrize("field,value", [("config", "RelWithDebInfo"), ("c_std", "99"), ("cxx_std", "23; rm"),
                                         ("warnings", "-fplugin=x")])
def test_build_settings_reject_values_outside_whitelist(field, value):
    with pytest.raises(ValueError):
        BuildSettings.from_dict({field: value})


def test_build_settings_reject_unknown_fields():
    with pytest.raises(ValueError):
        BuildSettings.from_dict({"cflags": "-O3"})
