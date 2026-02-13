# S3Desk Frontend (Vite + React)

This folder contains the S3Desk web UI. It talks to the S3Desk backend API.

## Development

1. Start the backend (default `http://127.0.0.1:8080`).
2. Start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies `/api/*` (including `/api/v1`) to the backend in dev. See `vite.config.ts`.

## Environment Variables

- `VITE_API_BASE_URL` (optional): Base URL for the backend API.
  - Default: `/api/v1`
  - Examples:
    - `https://api.example.com/api/v1`
    - `http://127.0.0.1:8080/api/v1`

Note: Vite env vars are baked at build time.

## Deploy To Vercel (Frontend-Only)

1. Create a Vercel project and set **Root Directory** to `frontend/`.
2. Set build settings:
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Ensure the Node.js version is compatible (this project expects Node 22.x).
4. Set env vars:
   - `VITE_API_BASE_URL=https://<your-backend-host>/api/v1`

This repo includes `frontend/vercel.json` to ensure React Router deep links (for example `/jobs`) are routed to `index.html`.

## Backend CORS / WS Notes

When the frontend runs on a different origin (Vercel), the backend must allow:
- Cross-origin requests for the frontend origin (configure backend `ALLOWED_HOSTS` to include the frontend hostname).
- Request headers used by the UI: `X-Api-Token`, `X-Profile-Id`.
- Browser access to `/api/v1/ws` (WebSocket) and `/api/v1/events` (SSE fallback).
