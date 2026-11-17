#!/usr/bin/env python3
"""Headless smoke test for the static site using Chromium."""

import json
import shutil
import subprocess
import sys
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROME = shutil.which("chromium") or shutil.which("chromium-browser")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def find_chrome() -> str:
    if CHROME is None:
        raise RuntimeError("Chromium non trovato")
    return CHROME


def run_server() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_port
    return server, port


def dump_dom(url: str) -> str:
    executable = find_chrome()
    profile = Path(tempfile.mkdtemp(prefix="mappa-globo-chrome-"))
    command = [
        executable,
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--virtual-time-budget=12000",
        f"--user-data-dir={profile}",
        "--dump-dom",
        url,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180)
    if result.returncode not in (0, 1):
        raise RuntimeError(f"Chromium ha fallito: {result.stderr[:500]}")
    return result.stdout


def parse_result(dom: str) -> dict[str, object]:
    for marker in ('data-test-result="', 'data-test-error="'):
        if marker not in dom:
            raise RuntimeError(f"marker mancante: {marker}")
    result_marker = dom.index('data-test-result="') + len('data-test-result="')
    result_end = dom.index('"', result_marker)
    raw_result = dom[result_marker:result_end]
    error_marker = dom.index('data-test-error="') + len('data-test-error="')
    error_end = dom.index('"', error_marker)
    raw_error = dom[error_marker:error_end]
    return {
        "result": json.loads(raw_result.replace("&quot;", '"')),
        "error": raw_error,
    }


def main() -> int:
    server, port = run_server()
    try:
        import threading

        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        time.sleep(0.5)

        harness_url = f"http://127.0.0.1:{port}/tests/browser-harness.html"
        dom = dump_dom(harness_url)
        parsed = parse_result(dom)
        result = parsed["result"]
        error = parsed["error"]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if error:
            print(f"SMOKE ERROR: {error}", file=sys.stderr)
            return 1
        if not bool(result.get("ok")) if isinstance(result, dict) else False:
            print("SMOKE FAILED", file=sys.stderr)
            return 1

        print("SMOKE PASSED")
        return 0
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
