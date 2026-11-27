# myagent web

Next.js chat workspace for the `myagent` Python API. The browser talks to Next.js
route handlers; the BFF stores the API access token in an HttpOnly cookie and
forwards authenticated requests to FastAPI. Conversation history remains in the
Python service's SQLite store. AI SDK UI manages the chat state and stream
protocol, while each response currently arrives as a completed answer from the
non-streaming Python endpoint.

## Run locally

Start the API from the repository root:

```bash
uv run myagent-api
```

In another terminal:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signup is available in
the UI while the API is started with `MYAGENT_SIGNUP_ENABLED=true`; turn that
setting off again to disable new registrations. The API defaults to
`http://127.0.0.1:5000`; set
`MYAGENT_API_URL` in `.env.local` if it runs elsewhere. Keep this value
server-only; do not prefix it with `NEXT_PUBLIC_`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
