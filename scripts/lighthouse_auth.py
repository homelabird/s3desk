#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request

try:
    import websockets
except ImportError:
    sys.stderr.write("Missing dependency: websockets. Install with `pip install websockets`.\n")
    sys.exit(1)


def wait_for_debug_port(port, timeout_s=10):
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json") as resp:
                targets = json.load(resp)
            for target in targets:
                if target.get("type") == "page":
                    return target["webSocketDebuggerUrl"]
        except Exception as exc:  # pragma: no cover - connectivity race
            last_err = exc
        time.sleep(0.2)
    raise RuntimeError(f"Failed to connect to Chrome DevTools on port {port}: {last_err}")


async def inject_local_storage(ws_url, api_token, profile_id, url):
    async with websockets.connect(ws_url) as ws:
        msg_id = 1

        async def send(method, params=None):
            nonlocal msg_id
            payload = {"id": msg_id, "method": method}
            if params:
                payload["params"] = params
            await ws.send(json.dumps(payload))
            msg_id += 1

        await send("Page.enable")
        await send("Runtime.enable")

        script_lines = []
        if api_token is not None:
            script_lines.append(
                f"localStorage.setItem('apiToken', JSON.stringify({json.dumps(api_token)}));"
            )
        if profile_id is not None:
            script_lines.append(
                f"localStorage.setItem('profileId', JSON.stringify({json.dumps(profile_id)}));"
            )
        script = "".join(script_lines) or "void 0;"

        await send("Page.addScriptToEvaluateOnNewDocument", {"source": script})
        await send("Page.navigate", {"url": url})
        await asyncio.sleep(1)


def run_lighthouse(url, port, output_path):
    cmd = [
        "lighthouse",
        url,
        "--port",
        str(port),
        "--disable-storage-reset",
        "--output",
        "html",
        "--output",
        "json",
        "--output-path",
        output_path,
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Lighthouse with localStorage preloaded for auth.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--api-token", required=True)
    parser.add_argument("--profile-id", default=None)
    parser.add_argument("--output", required=True, help="Base output path (without extension).")
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--chrome", default=os.environ.get("CHROME_BIN", "/usr/bin/google-chrome"))
    parser.add_argument("--user-data-dir", default="/tmp/lighthouse-profile-auth")
    parser.add_argument("--keep-chrome", action="store_true")
    parser.add_argument("--no-headless", action="store_true")
    args = parser.parse_args()

    chrome_cmd = [
        args.chrome,
        f"--remote-debugging-port={args.port}",
        f"--user-data-dir={args.user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
    ]
    if not args.no_headless:
        chrome_cmd.insert(1, "--headless=new")
    chrome_cmd.append("about:blank")

    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = wait_for_debug_port(args.port)
        asyncio.run(inject_local_storage(ws_url, args.api_token, args.profile_id, args.url))
        return run_lighthouse(args.url, args.port, args.output)
    finally:
        if not args.keep_chrome:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)


if __name__ == "__main__":
    sys.exit(main())
