# myagent — Development Goals

## 1. Project Overview

`myagent` is a modular, extensible LLM Agent framework built with Python.

The primary objective is to develop an agent capable of understanding user requests, making decisions, selecting appropriate Skills, retrieving relevant information, and executing tasks through Tools.

The system should support persistent conversations, user-specific context, and an API interface that allows other applications to interact with the agent.

### Core Objectives

1. Build an LLM Agent with dynamic Tool Calling and Skill Selection.
2. Implement Retrieval-Augmented Generation (RAG) with Vector Database integration.
3. Implement Session Management and persistent conversation history.
4. Develop a FastAPI-based backend to expose agent capabilities as a microservice.
5. Maintain a modular architecture that supports future extensions.

---

# 2. Development Goals

## Goal 1: Agent, Tools & Skill System

### Objective

Build an LLM-driven Agent that can dynamically select and execute Tools and Skills based on the current conversation context.

### Requirements

- Maintain an iterative Agent Loop.
- Support LLM Tool Calling.
- Implement Tool Registry and Tool Schemas.
- Implement Skill Discovery and Skill Loading.
- Allow the LLM to decide which Skills are relevant.
- Support multiple Skills within a single task.
- Preserve conversation context during Tool execution.
- Handle Tool execution errors and invalid arguments.

### Initial Skills

| Skill | Responsibility |
|---|---|
| Persona Manager | Maintain user-provided preferences, goals, and relevant conversation context. |
| Comparative Persuasion | Present fair comparisons between similar products or alternatives. |
| Relevance Persuasion | Explain how a product or service relates to the user's stated needs and goals. |

### Expected Outcome

An Agent that can independently determine when to use a Skill, load its instructions, and combine it with available Tools.

---

## Goal 2: RAG Tools Calling & Vector Database

### Objective

Integrate Retrieval-Augmented Generation (RAG) into the Agent architecture, allowing the LLM to retrieve relevant information from external knowledge sources through Tool Calling.

The Agent should be able to determine when external knowledge is needed, invoke retrieval Tools, and use retrieved information to generate grounded responses.

### 2.1 Vector Database Integration

Implement a vector storage and retrieval layer.

Requirements:

- Store document embeddings in a Vector Database.
- Support document insertion and deletion.
- Support semantic similarity search.
- Retrieve relevant document chunks based on user queries.
- Support metadata filtering.
- Return source references and relevant metadata.
- Support updating existing documents.

### 2.2 Document Ingestion

Implement a document processing pipeline.

Expected workflow:

1. Accept documents from supported sources.
2. Extract text content.
3. Split documents into manageable chunks.
4. Generate embeddings.
5. Store embeddings and metadata in the Vector Database.

Initial document formats and ingestion methods should be defined during implementation.

### 2.3 RAG Tools

Expose retrieval capabilities through the existing Tool Calling architecture.

Potential Tools:

| Tool | Responsibility |
|---|---|
| `search_knowledge` | Retrieve relevant document chunks using semantic search. |
| `add_document` | Add a document to the knowledge base. |
| `delete_document` | Remove a document from the knowledge base. |
| `list_documents` | List available documents and metadata. |

The LLM should decide when to invoke retrieval Tools rather than performing retrieval on every user message.

### 2.4 Retrieval Workflow

```text
User Request
     |
     v
Agent receives request
     |
     v
LLM determines whether external knowledge is needed
     |
     v
LLM calls search_knowledge
     |
     v
Vector Database
     |
     v
Retrieve relevant chunks
     |
     v
Return retrieved context and sources
     |
     v
LLM analyzes retrieved information
     |
     v
Generate grounded response
```

### Expected Outcome

The Agent can retrieve relevant information from a knowledge base through Tool Calling and use the retrieved content as additional context.

---

## Goal 3: Session Management & FastAPI Microservice

### Objective

Transform the current CLI-based Agent into a backend service that can support multiple users and concurrent conversations.

FastAPI will provide an HTTP API interface for external applications to interact with the Agent.

### 3.1 Session Management

Implement conversation session management.

Requirements:

- Create a new conversation session.
- Generate and manage unique session IDs.
- Associate sessions with users.
- Retrieve existing conversation sessions.
- Maintain conversation history.
- Append new messages to an existing session.
- Support session deletion.
- Isolate conversation contexts between sessions.
- Persist conversation history across application restarts.

### 3.2 Conversation Context

The system should distinguish between:

- **Session History:** Messages exchanged within a conversation.
- **Persona:** Relevant information about a conversation partner.
- **Knowledge Base:** External documents and information retrieved through RAG.

These components should be managed independently while remaining accessible to the Agent when needed.

### 3.3 FastAPI Development

Expose Agent functionality through REST API endpoints.

Initial endpoint proposals:

| Method | Endpoint | Responsibility |
|---|---|---|
| POST | `/sessions` | Create a new session. |
| GET | `/sessions/{session_id}` | Retrieve session information. |
| DELETE | `/sessions/{session_id}` | Delete a session. |
| POST | `/sessions/{session_id}/messages` | Send a message and receive an Agent response. |
| GET | `/sessions/{session_id}/messages` | Retrieve conversation history. |
| GET | `/health` | Check service health. |

### 3.4 Backend Architecture

The API layer should be separated from Agent orchestration.

Expected responsibilities:

| Component | Responsibility |
|---|---|
| FastAPI | HTTP routing and request handling. |
| Session Manager | Session lifecycle and conversation history. |
| Agent | LLM orchestration, Skill Selection, and Tool Calling. |
| Tool Registry | Tool registration and execution. |
| RAG Service | Document retrieval and knowledge-base operations. |
| Vector Database | Embedding storage and similarity search. |
| Persistence Layer | Store sessions, messages, and relevant application data. |

### Expected Outcome

An API-based Agent service that supports multiple users, independent conversation sessions, persistent history, and integration with external applications.

---

# 3. Target Architecture

The following architecture represents the intended direction of the project.

```text
                 External Applications
                          |
                          v
                    FastAPI Server
                          |
                          v
                  Session Management
                          |
                          v
                    Agent (LLM)
                          |
              +-----------+-----------+
              |           |           |
              v           v           v
           Skills       Tools        RAG
              |           |           |
              |           v           v
              |       Tool Registry  Retrieval
              |           |           |
              |           v           v
              |      Python Functions Vector DB
              |                       |
              +-----------+-----------+
                          |
                          v
                    LLM Response
                          |
                          v
                    Session Storage
                          |
                          v
                    API Response
```

---

# 4. Development Roadmap

Development should be divided into incremental phases.

| Phase | Focus | Expected Deliverable |
|---|---|---|
| 1 | Agent & Skill System | Working Skill Discovery, Loading, and Tool Calling |
| 2 | Persona Management | Persistent persona storage and retrieval |
| 3 | RAG Foundation | Document ingestion, embedding, and Vector Database |
| 4 | RAG Tool Integration | LLM-driven retrieval through Tool Calling |
| 5 | Session Management | Persistent sessions and conversation history |
| 6 | FastAPI Backend | REST API for Agent interactions |
| 7 | Integration & Testing | End-to-end testing across all components |

---

# 5. Non-Functional Requirements

### Modularity

Each component should have a clear responsibility and should be independently extensible.

### Scalability

The architecture should support multiple users and concurrent sessions.

### Maintainability

Use clear interfaces between the Agent, Tools, RAG, Session Manager, and API layers.

### Reliability

Implement error handling for LLM requests, Tool execution, retrieval failures, and persistence operations.

### Context Isolation

Ensure that messages, personas, and retrieved context belonging to different users or sessions are not mixed.

### Observability

Provide structured logging for:

- Agent execution.
- Tool calls.
- Skill selection.
- Retrieval operations.
- Session lifecycle.
- API requests and errors.

---

# 6. Testing Strategy

Each component should be tested independently before end-to-end integration.

| Component | Testing Focus |
|---|---|
| Agent | Tool Calling and iterative execution |
| Skill System | Skill discovery, loading, and selection |
| Persona | Create, retrieve, and update persona data |
| Vector Database | Insert, search, update, and delete |
| RAG | Retrieval relevance and source attribution |
| Session Manager | Session isolation and persistence |
| FastAPI | Endpoint behavior and request validation |
| Integration | Multi-turn conversations using Skills, Tools, and RAG |

---

# 7. Open Design Decisions

The following decisions must be finalized before implementation.

- Vector Database selection.
- Embedding model selection.
- Document chunking strategy.
- Session and conversation storage technology.
- User authentication and authorization.
- API response format and streaming requirements.
- Deployment strategy.

---

# 8. Final Development Vision

The final goal is to transform `myagent` from a CLI-based LLM Agent prototype into a modular, API-accessible Agent service.

The Agent should be capable of:

1. Understanding user requests and conversation context.
2. Selecting relevant Skills dynamically.
3. Executing Tools through structured Tool Calling.
4. Retrieving external knowledge through RAG.
5. Maintaining independent user sessions and conversation histories.
6. Providing persistent and context-aware interactions through a FastAPI service.

The LLM remains responsible for reasoning and selecting appropriate Skills and Tools, while the application manages execution, persistence, and service infrastructure.
