"""Tiny .env reader for local development (no extra dependency).

Real environment variables always win, so Render's dashboard secrets are never overridden.
"""

import os


def parse_env_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        return None
    key, value = line.split("=", 1)
    key, value = key.strip().removeprefix("export ").strip(), value.strip()
    if not key.isidentifier():
        return None
    if value[:1] in ("'", '"'):
        end = value.find(value[0], 1)
        value = value[1:end] if end != -1 else value[1:]
    else:
        value = value.split(" #", 1)[0].strip()  # inline comment
    return key, value


def load_env_file(path: str) -> None:
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                pair = parse_env_line(line)
                if pair and pair[1] != "":
                    os.environ.setdefault(*pair)
    except FileNotFoundError:
        pass
