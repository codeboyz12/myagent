# Web search and MCP servers

The agent backend is the existing Python AI SDK agent. MCP tools are attached at its tool registry boundary and remain server-side. Built-in SearXNG uses STDIO to run mcp-searxng; custom user connectors use Streamable HTTP. Custom connector bearer tokens are encrypted in the existing user settings store.

## Start local SearXNG

Docker Compose binds SearXNG to loopback only. JSON search output is enabled in docker/searxng/settings.yml; the Compose health check verifies the local HTTP service.

    SEARXNG_SECRET="$(openssl rand -hex 32)" docker compose -f compose.searxng.yml up -d
    docker compose -f compose.searxng.yml ps
    curl --fail 'http://127.0.0.1:8080/search?q=SearXNG&format=json'

Stop it with:

    docker compose -f compose.searxng.yml down

The default port is 8080. Set SEARXNG_PORT to use another free host port and set SEARXNG_URL to the same URL in the backend environment. SEARXNG_URL, tool timeout/content limits, and the mcp-searxng executable/arguments are configurable through .env; see .env.example. The generated SEARXNG_SECRET is passed to the official image. Keep this service bound to localhost unless you add an authenticated reverse proxy.

The Compose health status checks SearXNG HTTP availability. A live query additionally tests JSON output and upstream engine connectivity. If health is good but searches fail, inspect docker compose logs and confirm JSON is enabled with curl.

## Use MCP settings

Open Settings → MCP servers. SearXNG is present by default and can be disabled, but not removed. Add custom servers by their Streamable HTTP MCP endpoint; STDIO commands are intentionally not accepted from user settings. Only enabled tools are discovered and exposed to the model. Names from custom servers are prefixed with the server ID to avoid collisions.

If a custom server requires a bearer token, save it in its settings form. It is encrypted at rest using MYAGENT_SETTINGS_ENCRYPTION_KEY; configure that key before saving credentials. The token is never returned to the browser after saving.

The agent uses search for current or external information, can read selected URLs, cites URLs present in tool results, and treats retrieved page contents as untrusted data. mcp-searxng blocks private/internal target URLs by default. When search is unavailable, tool errors state that live information could not be verified.

## Troubleshooting

- connection refused: start Compose and check that SEARXNG_URL and SEARXNG_PORT agree.
- SearXNG returns 403 for JSON: inspect docker/searxng/settings.yml and verify search.formats includes json.
- No model search calls: confirm SearXNG is enabled under Settings → MCP servers and that the selected model endpoint supports tool calling.
- npx not found: install Node.js 22+ or set MCP_SEARXNG_COMMAND and MCP_SEARXNG_ARGS to a local mcp-searxng installation.
- MCP connection errors: custom endpoints must support Streamable HTTP. Check their endpoint path, authentication, and server logs.
