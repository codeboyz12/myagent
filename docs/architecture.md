# myagent — Architecture & Workflow

> เอกสารนี้อธิบาย architecture ทั้งหมดของ myagent ตั้งแต่โครงสร้างไฟล์, Docker services, backend API, session lifecycle, tools, RAG pipeline, frontend, จนถึง data flow ของแต่ละ chat turn

---

## 1. Project Structure

```
myagent/
├── pyproject.toml                        # Python dependencies & entry points
├── Dockerfile                            # Python 3.12-slim image → myagent-api
├── compose.yaml                          # Docker Compose: 4 services
├── .env.example                          # Environment variable template
│
├── src/myagent/
│   ├── api.py                            # FastAPI server (~3000 lines, all endpoints)
│   ├── auth.py                           # SQLite auth store, password hashing
│   ├── settings.py                       # Encrypted user settings store (Fernet)
│   ├── sessions/
│   │   ├── manager.py                    # SessionManager: run_turn, session lifecycle
│   │   └── store.py                      # SQLiteSessionStore
│   ├── agents/
│   │   └── myagent.py                    # SYSTEM_PROMPT constant + CLI loop
│   └── tools/
│       ├── registry.py                   # get_agent_tools(): 9 async tools
│       ├── skills.py                     # SKILL.md discovery & loading
│       ├── retriever.py                  # Async RAG via vector-service
│       ├── mcp.py                        # MCP server integration
│       ├── filesystem.py                 # list_files, read_file (workspace-scoped)
│       ├── persona.py                    # Persona JSON storage
│       └── context.py                    # ToolContext dataclass
│
├── services/vector-service/
│   └── app/
│       ├── main.py                       # FastAPI: GET /health, POST /retrieve
│       ├── embedding.py                  # intfloat/multilingual-e5-small
│       └── seed.py                       # Seed documents.json into Qdrant
│
├── web/
│   ├── src/app/
│   │   ├── chat/[sessionId]/page.tsx     # Chat session view
│   │   ├── settings/page.tsx             # Settings page
│   │   ├── usage/page.tsx                # Analytics page
│   │   ├── signin/ signup/               # Auth pages
│   │   └── api/                          # 20+ Next.js route handlers (BFF)
│   ├── src/components/
│   │   ├── chat/                         # ChatPanel, MessageComposer, ConversationMessages
│   │   ├── workspace/                    # Settings forms, sidebar, library, MCP
│   │   └── ui/                           # 24 shadcn/ui base components
│   └── src/lib/
│       ├── chat-shape.ts                 # Zod schemas for all shared types
│       ├── uuid.ts                       # randomUUID() with HTTP-safe fallback
│       └── server/backend.ts             # Backend proxy helper + auth cookie
│
├── skills/
│   ├── persona-manager/SKILL.md
│   ├── comparative-persuasion/SKILL.md
│   └── relevance-persuasion/SKILL.md
│
└── data/personas/                        # Local persona JSON files
```

---

## 2. Docker Services

```
                  ┌───────────────────────────────────┐
                  │        compose.yaml               │
                  │                                   │
  :3000 ──────────┤  web  (Next.js standalone)        │
                  │        ↓ http://api:5000          │
  :5000 ──────────┤  api  (FastAPI / myagent-api)     │
                  │        ↓ http://vector-service:8000│
         internal ┤  vector-service (FastAPI + e5)    │
                  │        ↓ http://qdrant:6333        │
  :6333 ──────────┤  qdrant (v1.15.1)                 │
                  └───────────────────────────────────┘
```

| Service | Image | Ports | Volume | Key Env |
|---------|-------|-------|--------|---------|
| **qdrant** | `qdrant/qdrant:v1.15.1` | `127.0.0.1:6333` | `qdrant_storage` | — |
| **vector-service** | `services/vector-service` | internal `:8000` | `model_cache:/models` | `QDRANT_URL`, `HF_HOME` |
| **api** | root `Dockerfile` | `127.0.0.1:5000` | `agent_data:/root/.myagent` | `VECTOR_SERVICE_URL`, `MYAGENT_SKILLS_DIR=/app/skills`, `MYAGENT_SETTINGS_ENCRYPTION_KEY` |
| **web** | `web/Dockerfile` | `0.0.0.0:3000` | — | `MYAGENT_API_URL=http://api:5000`, `COOKIE_SECURE` |

---

## 3. Backend API Endpoints

### Auth (ไม่ต้องการ Token)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| POST | `/auth/signup` | สมัครบัญชี (ต้องเปิด `MYAGENT_SIGNUP_ENABLED=true`) |
| POST | `/auth/signin` | Login → returns `access_token` |
| POST | `/auth/signout` | Revoke token |
| GET | `/auth/chatgpt/callback` | ChatGPT OAuth callback |

### Sessions (ต้องการ Bearer Token)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/sessions` | สร้าง session ใหม่ พร้อม system prompt |
| GET | `/sessions` | List sessions ของ user |
| GET | `/sessions/{id}` | ดู session status |
| PATCH | `/sessions/{id}` | Rename session |
| DELETE | `/sessions/{id}` | ลบ session |
| DELETE | `/sessions` | ลบทุก session |
| POST | `/sessions/{id}/messages` | ส่งข้อความ → stream LLM response |
| GET | `/sessions/{id}/messages` | ดึง message history |

### Model Providers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/providers` | List providers ทั้งหมด |
| POST | `/settings/providers` | เพิ่ม provider |
| PUT | `/settings/providers/{id}` | แก้ไข provider |
| PATCH | `/settings/providers/{id}/enabled` | Enable/disable |
| DELETE | `/settings/providers/{id}` | ลบ provider |
| POST | `/settings/model/discover` | Discover models จาก endpoint |
| GET | `/models` | List models จาก active provider |

### Agent Settings
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/settings/agent-library` | Skills + Personas enable state |
| GET/PUT | `/settings/agent-instruction` | Custom system prompt |
| GET/PUT | `/settings/mcp-servers` | MCP server list + tokens |
| GET | `/settings/chatgpt-plan` | ChatGPT plan connection status |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/usage/analytics` | Token usage stats (by day, model, turn count) |

---

## 4. Session Lifecycle & run_turn Flow

```
POST /sessions
  └─→ sessions_for(owner_id).create_session(
        [ai.system_message(agent_instruction_for(owner_id))]  ← custom or default
      )
      └─→ SQLiteSessionStore.create_session()
          └─→ return SessionSummary { session_id, title, ... }

POST /sessions/{id}/messages
  └─→ Rate limit check (30 msg/60sec)
  └─→ SessionManager.run_turn()
        │
        ├─ Load session messages from DB
        ├─ Build ToolContext { workspace_root, persona_dir, library, mcp_servers }
        ├─ Build MCP tools (SearXNG + custom)
        ├─ get_agent_tools(context)  → 9 async tools
        │
        ├─ Agent.run(model, messages, tools)   ← Vercel AI SDK
        │     │
        │     ├─ Stream TextDelta    → queue → SSE client
        │     ├─ Stream ToolStart    → record to DB, send tool_activity event
        │     ├─ Execute Tool        → result returned to LLM
        │     └─ Stream Complete     → finalize turn, dump messages to DB
        │
        └─ Return MessageResponse { response, tool_events }
```

---

## 5. Tool Registry — 9 Agent Tools

ทุก tool เป็น `async def` และ scope ตาม session workspace

| Tool | Purpose |
|------|---------|
| `list_files(path, limit)` | List files ใน workspace |
| `read_file(path, offset, limit)` | อ่าน file แบบ line-based |
| `list_skills()` | Discover enabled skills จาก library |
| `load_skill(skill_name)` | โหลด SKILL.md content |
| `retrieve_documents(query, top_k, score_threshold)` | Semantic search ผ่าน vector-service **(async httpx)** |
| `get_persona(persona_id)` | ดึง persona JSON |
| `list_personas()` | List persona IDs |
| `update_persona(persona_id, field, value, confidence, evidence)` | บันทึก persona attribute |
| `delete_persona(persona_id)` | ลบ persona |
| **+ MCP tools** | `searxng_web_search`, `web_url_read` ฯลฯ |

---

## 6. Skills System

### Discovery
```
MYAGENT_SKILLS_DIR env var
  └─→ /app/skills/                   (Docker)
      ├─ persona-manager/SKILL.md
      ├─ comparative-persuasion/SKILL.md
      └─ relevance-persuasion/SKILL.md

~/.codex/skills/.system/              (system skills, prefix: "system/")
```

> **หมายเหตุ:** `SKILLS_DIR` คำนวณจาก `__file__` ซึ่งผิดเมื่อ install ผ่าน pip จึงต้องกำหนด `MYAGENT_SKILLS_DIR=/app/skills` ใน compose.yaml

### Loading Flow
1. Agent เรียก `list_skills()` → รายการ skill + description
2. Agent เลือก skill ที่เกี่ยวข้อง
3. เรียก `load_skill("skill-name")` → โหลด SKILL.md เต็ม
4. Follow instructions ใน SKILL.md

### 3 Built-in Skills

| Skill | วัตถุประสงค์ |
|-------|------------|
| **persona-manager** | เก็บและจัดการ profile ผู้ใช้ (goals, interests, priorities, preferences, pain_points, objections) — เก็บเฉพาะข้อมูลที่ผู้ใช้บอกมาโดยตรง ไม่ inference |
| **comparative-persuasion** | เปรียบเทียบสินค้า/ทางเลือกอย่างเป็นธรรม โดยใช้ criteria ที่ตรงกับ priority ของผู้ใช้ |
| **relevance-persuasion** | อธิบายว่าสินค้า/ไอเดียตอบโจทย์ goals ของผู้ใช้อย่างไร โดยใช้ข้อมูลจาก persona + retrieve_documents |

---

## 7. RAG Pipeline

```
User asks about products
  │
  ▼
Agent calls retrieve_documents(query, top_k=3)
  │
  ▼
retriever.py
  async with httpx.AsyncClient(timeout=30s) as client:
    POST http://vector-service:8000/retrieve
    { query, top_k }
  │
  ▼
vector-service/app/main.py
  Embed query: "query: {text}" → 384-dim vector
  Search Qdrant collection "documents" (cosine similarity)
  Return top-k results { id, text, score, metadata }
  │
  ▼
Qdrant (port 6333)
  Collection: "documents"
  Vector: 384-dim, cosine distance
  Payload: text, metadata { product_id, name, price, category, source }
  │
  ▼
Agent receives results → incorporates into response
```

### Document Seeding
```bash
# แก้ไข documents.json
vi services/vector-service/app/documents.json

# Seed เข้า Qdrant
docker compose exec vector-service python -m app.seed

# Format ของแต่ละ document
{ "id": 1, "text": "...", "metadata": { "source": "...", ... } }
```

### Embedding Model
- **Model:** `intfloat/multilingual-e5-small`
- **Dimensions:** 384
- **Language:** Multilingual รองรับภาษาไทย + 100+ ภาษา
- **Prefix:** query: สำหรับ query / passage: สำหรับ document

---

## 8. Settings Store

**File:** `~/.myagent/auth.sqlite3` (mounted via Docker volume `agent_data`)

```
user_settings(owner_id, namespace, schema_version, value_json, updated_at)
user_secrets(owner_id, namespace, secret_name, encrypted_value, updated_at)
```

| Namespace | เก็บอะไร | Encrypted |
|-----------|---------|-----------|
| `model` | active_provider_id | — |
| `model-providers` | providers list (base_url, model_id, reasoning_effort, model_controls) | API keys |
| `agent_library` | skills/personas enable state | — |
| `mcp_servers` | server list (id, name, url, transport) | tokens |
| `agent_instruction` | custom system prompt text | — |
| `chatgpt-plan` | OAuth client_id, subject, email, expires_at, scopes | access_token, refresh_token, id_token |

> Secrets encrypted ด้วย **Fernet** key จาก `MYAGENT_SETTINGS_ENCRYPTION_KEY` env var

---

## 9. Agent System Prompt

**Default location:** `src/myagent/agents/myagent.py` → `SYSTEM_PROMPT`

**Sections:**
- **Skill Selection** — list_skills → analyze → load_skill → follow
- **Persona** — ใช้ update_persona เก็บ preference, ห้าม infer
- **Persuasion** — เลือก comparative หรือ relevance ตาม context
- **Knowledge Base** — เรียก retrieve_documents ก่อนตอบทุกครั้งที่ถามเรื่องสินค้า
- **Tool Usage** — ใช้ tool เท่าที่มีจริง
- **Web Search** — ใช้ searxng, cite URL จาก result เท่านั้น

**Custom Instruction Override:**
```
GET /settings/agent-instruction
  → { instruction: string, is_default: boolean }

PUT /settings/agent-instruction
  → { instruction: "custom text" }   # บันทึก override
  → { instruction: "" }              # reset กลับ default
```

ทุก session ใหม่ใช้ `agent_instruction_for(owner_id)` ซึ่ง return custom หรือ default อัตโนมัติ

---

## 10. Frontend Architecture

### Pages
| Path | Purpose |
|------|---------|
| `/` | Redirect → `/signin` |
| `/signin` | Login form |
| `/signup` | Register (ถ้าเปิด MYAGENT_SIGNUP_ENABLED) |
| `/chat` | Welcome + create new session |
| `/chat/[sessionId]` | Chat session view |
| `/settings` | Model, MCP, Library, Instruction settings |
| `/usage` | Token usage analytics |

### Next.js BFF (Backend-for-Frontend)

ทุก `/api/*` route เป็น proxy ไปที่ Python backend พร้อม inject `Authorization: Bearer {token}` จาก HttpOnly cookie

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/signin` | POST | Proxy + set cookie |
| `/api/auth/signout` | POST | Clear cookie |
| `/api/auth/session` | GET | Get current user |
| `/api/chat` | POST | Proxy + stream response |
| `/api/sessions` | GET/POST/DELETE | Session management |
| `/api/sessions/[id]` | GET/PATCH/DELETE | Single session ops |
| `/api/sessions/[id]/messages` | GET | Message history |
| `/api/models` | GET | List models |
| `/api/model-providers` | GET/POST/PATCH | Provider management |
| `/api/model-providers/[id]` | PUT/DELETE/PATCH | Provider CRUD |
| `/api/model-settings` | GET/PUT | Active model config |
| `/api/model-settings/discover` | POST | Discover models |
| `/api/model-settings/controls` | PATCH | Update model controls |
| `/api/agent-library` | GET/PUT | Library settings |
| `/api/agent-instruction` | GET/PUT | System prompt |
| `/api/mcp-servers` | GET/PUT | MCP servers |
| `/api/chatgpt-plan` | GET/POST/DELETE | ChatGPT plan OAuth |
| `/api/usage/analytics` | GET | Usage stats |

### Auth Cookie
```
Cookie: myagent_access_token (HttpOnly, SameSite=Lax)
  ├─ Set on: signin / signup
  ├─ Deleted on: signout / 401 response
  ├─ COOKIE_SECURE=false (dev HTTP) / true (prod HTTPS)
  └─ TTL: matches API token expiration
```

---

## 11. Complete Chat Turn — Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  USER พิมพ์ข้อความในหน้า /chat/[sessionId]                      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
         ┌────────────────────────────────────┐
         │  Frontend: POST /api/chat          │
         │  { sessionId, content, messageId } │
         └────────────────┬───────────────────┘
                          │ same-origin check
                          ▼
         ┌────────────────────────────────────┐
         │  Next.js BFF Route Handler         │
         │  - Extract token from cookie       │
         │  - POST /sessions/{id}/messages    │
         │    Authorization: Bearer {token}   │
         └────────────────┬───────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  FastAPI Backend                   │
         │  - Authenticate owner              │
         │  - Rate limit (30/60s)             │
         │  - SessionManager.run_turn()       │
         └────────────────┬───────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Load msgs   Build tools  Agent.run()
         from DB     (9 tools +   (AI SDK +
                      MCP)         LLM)
                                    │
                      ┌─────────────┼─────────────┐
                      ▼             ▼             ▼
                  TextDelta     ToolStart     Complete
                  (stream)      → execute      → save
                                  tool          to DB
                                    │
                          ┌─────────┴───────────┐
                          ▼                     ▼
                   retrieve_documents      searxng_search
                   → vector-service:8000   → MCP server
                   → Qdrant               → results
                          │
                          └──────────────────────┘
                                    │
                                    ▼
         ┌────────────────────────────────────────────┐
         │  SSE Stream → Frontend                     │
         │  data: {"type":"text_delta","delta":"..."}  │
         │  data: {"type":"tool_activity",...}         │
         │  data: {"type":"complete","response":"..."}  │
         └────────────────────────────────────────────┘
                                    │
                                    ▼
         ┌────────────────────────────────────────────┐
         │  USER เห็น response แบบ streaming          │
         │  พร้อม tool activity และ sources           │
         └────────────────────────────────────────────┘
```

---

## 12. Architecture Overview Diagram

```
                        ┌──────────────────────┐
                        │   USER BROWSER       │
                        │   :3000              │
                        └──────────┬───────────┘
                                   │ HTTPS / HTTP
                                   ▼
                        ┌──────────────────────┐
                        │  NEXT.JS (web)       │
                        │  :3000               │
                        │  - React UI          │
                        │  - BFF API routes    │
                        │  - Auth cookie mgmt  │
                        └──────────┬───────────┘
                                   │ Bearer token
                                   ▼
                        ┌──────────────────────┐
                        │  FASTAPI (api)       │
                        │  :5000               │
                        │  - Auth & sessions   │
                        │  - Settings store    │
                        │  - SessionManager    │
                        │  - AI SDK Agent      │
                        └───┬──────────┬───────┘
                            │          │
              ┌─────────────┘          └─────────────┐
              ▼                                      ▼
   ┌─────────────────────┐             ┌─────────────────────┐
   │  LLM Provider       │             │  VECTOR SERVICE     │
   │  (OpenAI-compat,    │             │  :8000              │
   │   Groq, Ollama,     │             │  - e5-small model   │
   │   ChatGPT plan)     │             │  - POST /retrieve   │
   └─────────────────────┘             └──────────┬──────────┘
                                                  │
                                                  ▼
                                       ┌─────────────────────┐
                                       │  QDRANT             │
                                       │  :6333              │
                                       │  - documents (384d) │
                                       │  - cosine search    │
                                       └─────────────────────┘
```

---

## 13. Environment Variables

```bash
# LLM Provider
HF_BASE_URL=https://router.huggingface.co/v1
HF_TOKEN=hf_...
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1

# Settings encryption (required)
MYAGENT_SETTINGS_ENCRYPTION_KEY=<base64-fernet-key>

# API server (set by compose.yaml)
MYAGENT_API_HOST=0.0.0.0
MYAGENT_API_PORT=5000
MYAGENT_SIGNUP_ENABLED=true

# Services (set by compose.yaml)
VECTOR_SERVICE_URL=http://vector-service:8000
MYAGENT_SKILLS_DIR=/app/skills

# Frontend (set by compose.yaml)
MYAGENT_API_URL=http://api:5000
COOKIE_SECURE=false
```

---

## 14. Git Workflow

```
main
 └─ develop
     └─ feature/* / integrate/*   (working branches → PR → develop → main)
```

**ขั้นตอน:**
1. ทำงานใน feature branch
2. `git push origin HEAD` → สร้าง PR → develop
3. Merge PR → develop
4. Merge develop → main

---

## 15. Quick Start

```bash
# 1. ตั้งค่า env
cp .env.example .env
# แก้ไข .env ใส่ API keys

# 2. Start services
docker compose up -d

# 3. Seed documents สำหรับ RAG
docker compose exec vector-service python -m app.seed

# 4. เปิด browser
open http://localhost:3000

# 5. สมัครบัญชีและเพิ่ม model connection ใน Settings

# 6. หยุด services
docker compose down
```
