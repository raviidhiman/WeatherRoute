import os

from config.envfile import load_env_file, parse_env_line


def test_parse_handles_comments_quotes_and_blanks():
    assert parse_env_line("DJANGO_DEBUG=1   # 0 in production") == ("DJANGO_DEBUG", "1")
    assert parse_env_line('UA="WeatherRoute/1.0 (a@b.c)"') == ("UA", "WeatherRoute/1.0 (a@b.c)")
    assert parse_env_line("export K=v") == ("K", "v")
    assert parse_env_line("# comment") is None and parse_env_line("") is None and parse_env_line("no equals") is None


def test_real_env_wins_and_empty_values_are_skipped(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("WR_TEST_A=from-file\nWR_TEST_B=from-file\nWR_TEST_EMPTY=\n")
    monkeypatch.setenv("WR_TEST_A", "from-env")
    monkeypatch.delenv("WR_TEST_B", raising=False)
    monkeypatch.delenv("WR_TEST_EMPTY", raising=False)
    load_env_file(str(f))
    assert os.environ["WR_TEST_A"] == "from-env"
    assert os.environ["WR_TEST_B"] == "from-file"
    assert "WR_TEST_EMPTY" not in os.environ
    monkeypatch.delenv("WR_TEST_B", raising=False)


def test_missing_file_is_fine(tmp_path):
    load_env_file(str(tmp_path / "nope.env"))
