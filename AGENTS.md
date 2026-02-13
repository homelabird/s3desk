# Agent Working Rules

## Branch policy
- Work only on `main`.
- Do not create or switch to feature branches unless the user explicitly asks.
- Before commit/push, verify the current branch is `main`.

## URL policy (agent responses)
- When giving URLs to the user, do not use `localhost` or `127.0.0.1`.
- Use the host IP: `192.168.0.200`.
- Default URLs to share:
  - UI: `http://192.168.0.200:8080`
  - API docs: `http://192.168.0.200:8080/docs`
  - OpenAPI spec: `http://192.168.0.200:8080/openapi.yml`
  - Frontend dev server: `http://192.168.0.200:5173`
- Related remote-access requirements (must be mentioned when relevant):
  - `ADDR=0.0.0.0:8080`
  - `ALLOW_REMOTE=true`
  - `ALLOWED_HOSTS` must include `192.168.0.200`
  - `API_TOKEN` should be set
