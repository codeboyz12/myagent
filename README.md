# myagent

Local SearXNG web search and user-managed MCP server setup is documented in [docs/web-search.md](docs/web-search.md).

**A lightweight, extensible LLM Agent built with Python.**

`myagent` is a personal LLM Agent project designed to explore how Large Language Models can reason, interact with tools, and extend their capabilities through modular Skills.

The project focuses on building a flexible Agent architecture where the LLM decides which tools and skills to use based on the current conversation context.

## Features

- **LLM Integration** — Stream model responses through Vercel's AI SDK.
- **Tool Calling** — Expose typed Python functions as tools managed by the AI SDK.
- **Skill System** — Extend agent capabilities using Markdown-based instructions.
- **Dynamic Skill Selection** — Let the LLM discover and select relevant skills at runtime.
- **Persona Management** — Maintain structured information about conversation partners.
- **Extensible Architecture** — Add new tools, skills, and model adapters independently.

## Architecture

The project separates model communication, agent orchestration, tools, and skills into independent components.

```text
myagent/
│
├── pyproject.toml
├── uv.lock
├── src/
│   └── myagent/
│       ├── __main__.py
│       ├── adapter/
│       ├── agents/
│       ├── sessions/
│       └── tools/
│
├── skills/
│   ├── persona-manager/
│   │   └── SKILL.md
│   │
│   ├── comparative-persuasion/
│   │   └── SKILL.md
│   │
│   └── relevance-persuasion/
│       └── SKILL.md
│
└── data/
    └── personas/
```

## Core Components

### 1. Agent

Located in `src/myagent/agents/myagent.py`.

The Agent is responsible for orchestrating interactions between the user, LLM, tools, and skills.

The agent keeps conversation history and delegates model streaming and tool execution to Vercel's AI SDK.

Its responsibilities include:

- Maintaining conversation history.
- Sending conversation messages and SDK tools to the model.
- Streaming generated text to the terminal.
- Retaining the complete conversation across turns.

The LLM determines which actions are appropriate based on the conversation context.

### 2. Model Adapter

Located in `src/myagent/adapter/`.

`ai_sdk.py` configures the AI SDK model to use Groq's OpenAI-compatible API.

This abstraction makes it possible to switch models without changing the core agent implementation.

### 3. Tool System

Located in `src/myagent/tools/`.

Tools provide executable capabilities that the LLM can invoke.

`registry.py` exposes the Python tools through `ai.tool`; the SDK derives tool schemas and manages tool calls.

Available tools include:

| Tool | Description |
|---|---|
| `list_files` | List files and folders in the session workspace |
| `read_file` | Read text files |
| `list_skills` | Discover available skills |
| `load_skill` | Load a skill's Markdown instructions |
| `get_persona` | Retrieve a persona profile |
| `list_personas` | List persona profile IDs in the current session |
| `update_persona` | Update persona information |
| `delete_persona` | Delete a persona profile in the current session |

### 4. Skill System

Located in the top-level `skills/` directory.

Skills are modular Markdown instruction files that extend the agent's behavior.

Unlike tools, skills do not directly execute Python functions. They provide instructions and workflows that guide the LLM in performing specific tasks.

The Skill System follows a discovery-and-loading approach:

1. Discover available skills.
2. Analyze skill descriptions.
3. Select relevant skills.
4. Load the selected `SKILL.md`.
5. Follow the instructions.
6. Use available tools when necessary.

#### Available Skills

| Skill | Description |
|---|---|
| `persona-manager` | Understand and maintain structured persona information. |
| `comparative-persuasion` | Compare similar products and alternatives using relevant criteria. |
| `relevance-persuasion` | Explain how a product, service, or idea relates to a person's stated needs and goals. |

### 5. Persona Management

Located in `src/myagent/tools/persona.py`.

Persona Management maintains structured information about conversation partners.

The initial implementation uses JSON files for persistence.

Persona attributes include:

| Attribute | Description |
|---|---|
| `goals` | Personal or professional goals explicitly shared |
| `interests` | Topics and subjects of interest |
| `priorities` | Important decision-making criteria |
| `preferences` | Communication and decision preferences |
| `pain_points` | Problems or difficulties explicitly shared |
| `objections` | Concerns about a product, service, or idea |

Persona information should be based on information explicitly shared or consented to by the conversation partner.

## Agent Workflow

The agent uses an iterative tool-calling loop.

```text
                User Input
                    |
                    v
                Agent Loop
                    |
                    v
                 LLM Call
                    |
                    v
             LLM Decision Making
                    |
           +--------+--------+
           |                 |
           v                 v
       Tool Call        Final Response
           |
           v
      Tool Registry
           |
           v
     Execute Function
           |
           v
       Tool Result
           |
           v
      Append to Context
           |
           v
        LLM Call
           |
           v
      Continue Loop
```

When the LLM determines that a specialized skill is required, it can discover and load the corresponding Markdown instructions.

`list_skills` and `load_skill` also include Codex system-provided skills from
`$CODEX_HOME/skills/.system` (default: `~/.codex/skills/.system`). Their IDs
use the `system/` prefix, such as `system/imagegen`, so they remain distinct
from project skills.

## Getting Started

### Requirements

- Python 3.12+
- An LLM provider with compatible chat completion and tool-calling support
- An API key for the selected provider, if required

### Installation

Clone the repository:

```bash
git clone https://github.com/codeboyz12/myagent.git
cd myagent
```

Install the project and its dependencies with uv (this creates `.venv` and installs the `myagent` command):

```bash
uv sync
```

Copy the example environment file and add your provider credentials:

```bash
cp .env.example .env
```

`uv run` uses the project environment without requiring activation.

### Web workspace

The `web/` directory contains a Next.js chat interface backed by the session API.
Start the API with `uv run myagent-api`, then start the web app in a second
terminal:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to sign in or create an
account. Signup is available while the API is started with
`MYAGENT_SIGNUP_ENABLED=true`; turn that setting off to disable new accounts.
The Next.js backend-for-frontend stores the API token in an HttpOnly cookie; set
`MYAGENT_API_URL` in `web/.env.local` if the API is not at its default
`http://127.0.0.1:5000`. See [web/README.md](web/README.md) for details.

### Session API

The FastAPI service stores session history in SQLite and scopes every session,
workspace, and persona directory to the authenticated owner and session. Sign
in with `POST /auth/signin`; it accepts JSON with `email` and `password`, and
returns a bearer access token. Passwords must contain 12–128 characters.
Accounts and hashed access tokens are stored in `auth.sqlite3` under
`MYAGENT_DATA_DIR` (default `~/.myagent`); tokens expire after 24 hours and
`POST /auth/signout` revokes the current token. Signup with `POST /auth/signup`
is disabled by default; set `MYAGENT_SIGNUP_ENABLED=true` only when public
self-registration is intended in development or behind a controlled onboarding
flow. Signup attempts are limited by IP; signin
attempts are limited by both IP and normalized email. Both emit
credential-free authentication event logs. The
optional `MYAGENT_API_TOKENS` JSON map remains available for operator-managed
bearer tokens, which must be rotated by the operator.

Start the API with `uv run myagent-api`. It listens on `127.0.0.1:5000` by
default; set `MYAGENT_API_HOST` and `MYAGENT_API_PORT` to change the bind
address. The API uses `MYAGENT_DATA_DIR` for its SQLite database and owner
persona data, and `MYAGENT_API_WORKSPACE_ROOT` for isolated workspaces. Each
API session reads files from
`<workspace-root>/<sha256(owner-id)[:24]>/<sha256(session-id)[:24]>`; the API
does not currently provide a file upload route, so provision session files on
the server under that directory. Deleting a session removes its workspace and
persona directories.

Session routes and `/auth/signout` require `Authorization: Bearer <token>`.
`GET /health`, `/auth/signup`, and `/auth/signin` do not require a bearer token:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sessions` | Create an empty session |
| `GET` | `/sessions` | List the authenticated owner's sessions |
| `GET` | `/sessions/{session_id}` | Get session status |
| `DELETE` | `/sessions/{session_id}` | Delete session and its history |
| `POST` | `/sessions/{session_id}/messages` | Send `{"content":"..."}` and get the completed response |
| `GET` | `/sessions/{session_id}/messages` | Read user and assistant history |
| `GET` | `/health` | Check service availability |

Authentication routes:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/signup` | Register an account and issue an access token |
| `POST` | `/auth/signin` | Verify credentials and issue an access token |
| `POST` | `/auth/signout` | Revoke the current database-issued token |

For example, register and save the returned token:

```bash
MYAGENT_SIGNUP_ENABLED=true uv run myagent-api
# In another terminal:
curl -s -X POST http://127.0.0.1:5000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"a-long-unique-password"}'
```

### Production deployment requirements

The bundled SQLite stores are designed for one host with durable local disk;
SQLite WAL is not suitable for a shared network filesystem or multi-host
replicas. Back up the database files using a SQLite-consistent backup method,
and verify restore procedures before accepting durable user data. Put the API
behind a TLS-terminating reverse proxy, configure only trusted proxy handling,
protect database backups, and monitor disk capacity. The built-in signup flow
does not verify email ownership or support password recovery, and enabled
signup reveals whether an email already has an account. Keep signup disabled
for public deployments unless an external verification/onboarding process is
in place.
For multi-host availability, high write volume, or strong recovery objectives,
move session and auth persistence to an appropriately operated database before
deployment.

Send an optional `Idempotency-Key` header with a message request to safely
retry a completed request. Concurrent requests for the same session receive
`409` while a turn is active. Session content persists across service restarts.
The API currently returns completed messages rather than streaming tokens.

### Model settings

Signed-in users can add multiple personal OpenAI-compatible connections, edit
them, enable or disable them, and choose which enabled provider chat uses from
the Settings page. Each connection stores its own model and reasoning effort.
API keys are stored separately from versioned user settings and encrypted with
`MYAGENT_SETTINGS_ENCRYPTION_KEY`; the API never returns it. Generate a key
with:

```bash
uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Keep this encryption key stable and back it up separately from the database.
If it is lost, saved provider keys cannot be decrypted. Model catalogs are
cached for three minutes. Endpoints must implement OpenAI-compatible
`GET /models` and chat completions APIs; model aliases are used as display
labels, while IDs are sent to the provider.

For local/private model endpoints, set
`MYAGENT_ALLOW_PRIVATE_MODEL_ENDPOINTS=true`. This allows authenticated users
to make the API server connect to private network addresses, so enable it only
in a deployment where users are trusted to configure reachable endpoints.

`GROQ_*` and `MYAGENT_FALLBACK_*` remain available for the local CLI. The
authenticated web API uses each owner's saved model settings.

### Run

```bash
uv run myagent
```

To run the package module directly, use `uv run python -m myagent`.

### Sessions

Each run starts a new session unless `--session` is given. Session history,
turn status, partial streamed text, and tool audit events are stored in
`~/.myagent/sessions.sqlite3` by default. Set `MYAGENT_DATA_DIR` to move this
storage location and `MYAGENT_OWNER_ID` to scope sessions to a local user.

```bash
uv run myagent --list-sessions
uv run myagent --session <session-id>
uv run myagent --audit-session <session-id>
uv run myagent-clean-db
```

`myagent-clean-db` asks for confirmation before deleting all session, message,
turn, and audit data. It preserves the database file and schema, and refuses to
clear data while a turn is running. Use `--yes` for an unattended cleanup or
`--data-dir /path/to/myagent-data` to target another data directory.

File reads are restricted to the current directory by default; set
`MYAGENT_WORKSPACE` to choose another allowed directory. Local CLI owner IDs
are an isolation key, not an authentication mechanism. A hosted deployment
must supply a trusted owner ID from its authentication layer.

To verify multi-turn history against a running model server, configure
`GROQ_BASE_URL`, `GROQ_MODEL`, and `GROQ_API_KEY` in `.env`, start the model
server, then run:

```bash
MYAGENT_RUN_LIVE_SESSION_TEST=1 uv run python -m unittest tests.test_live_session_history -v
```

This opt-in test sends two real model requests, reopens the session database,
and checks that both turns remain in history. It uses a temporary database and
is skipped by the regular test suite unless explicitly enabled.

## Development Roadmap

- [x] Basic LLM adapter architecture
- [x] Initial Agent Loop
- [x] Tool registry with SDK-generated schemas
- [ ] Complete Skill Discovery and Loading integration
- [ ] Persona persistence and management
- [ ] Dynamic multi-skill orchestration
- [ ] Skill context management
- [ ] Improved tool execution and error handling
- [ ] Conversation-level memory management
- [x] Durable conversation sessions
- [ ] Additional model adapters

## Design Principles

**LLM-driven decision making**

The LLM determines which tools and skills are relevant rather than relying entirely on hardcoded rules.

**Modularity**

Tools, skills, adapters, and agent orchestration should remain independently extensible.

**Progressive Disclosure**

Load skill instructions only when they are relevant to the current task.

**Transparency and Accuracy**

Persona information and product comparisons should be grounded in available evidence. The agent should communicate uncertainty and respect user autonomy.
```
