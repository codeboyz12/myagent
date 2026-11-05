# myagent

**A lightweight, extensible LLM Agent built with Python.**

`myagent` is a personal LLM Agent project designed to explore how Large Language Models can reason, interact with tools, and extend their capabilities through modular Skills.

The project focuses on building a flexible Agent architecture where the LLM decides which tools and skills to use based on the current conversation context.

## Features

- **LLM Integration** — Connect to LLMs through an adapter-based architecture.
- **Tool Calling** — Allow the LLM to interact with external functions through structured tool schemas.
- **Skill System** — Extend agent capabilities using Markdown-based instructions.
- **Dynamic Skill Selection** — Let the LLM discover and select relevant skills at runtime.
- **Persona Management** — Maintain structured information about conversation partners.
- **Extensible Architecture** — Add new tools, skills, and model adapters independently.

## Architecture

The project separates model communication, agent orchestration, tools, and skills into independent components.

```text
myagent/
│
├── main.py
│
├── adapter/
│   ├── base.py
│   └── openai_adapter.py
│
├── agents/
│   ├── __init__.py
│   └── myagent.py
│
├── tools/
│   ├── __init__.py
│   ├── registry.py
│   ├── filesystem.py
│   ├── skills.py
│   ├── persona.py
│   └── schemas/
│       └── tool_schemas.json
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

Located in `agents/myagent.py`.

The Agent is responsible for orchestrating interactions between the user, LLM, tools, and skills.

Its responsibilities include:

- Maintaining conversation history.
- Sending messages and tool schemas to the LLM.
- Processing tool calls returned by the model.
- Executing the requested tools.
- Returning tool results to the LLM.
- Continuing the agent loop until a final response is generated.

The LLM determines which actions are appropriate based on the conversation context.

### 2. Model Adapter

Located in `adapter/`.

The adapter provides a unified interface for communicating with different LLM providers.

This abstraction makes it possible to switch models without changing the core agent implementation.

### 3. Tool System

Located in `tools/`.

Tools provide executable capabilities that the LLM can invoke.

The system uses two main components:

- `registry.py` — Maps tool names to Python functions.
- `schemas/tool_schemas.json` — Defines tool names, descriptions, and parameters exposed to the LLM.

Available tools include:

| Tool | Description |
|---|---|
| `read_file` | Read text files |
| `list_skills` | Discover available skills |
| `load_skill` | Load a skill's Markdown instructions |
| `get_persona` | Retrieve a persona profile |
| `update_persona` | Update persona information |

### 4. Skill System

Located in `skills/`.

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

Located in `tools/persona.py`.

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

## Getting Started

### Requirements

- Python 3.10+
- An LLM provider with compatible chat completion and tool-calling support
- An API key for the selected provider, if required

### Installation

Clone the repository:

```bash
git clone https://github.com/codeboyz12/myagent.git
cd myagent
```

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it:

**macOS / Linux**

```bash
source .venv/bin/activate
```

**Windows**

```bash
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### Configuration

Configure the required model settings and API credentials according to your selected adapter.

Keep API credentials in environment variables rather than hardcoding them in source files.

### Run

```bash
python main.py
```

## Development Roadmap

- [x] Basic LLM adapter architecture
- [x] Initial Agent Loop
- [x] Tool registry and schema definitions
- [ ] Complete Skill Discovery and Loading integration
- [ ] Persona persistence and management
- [ ] Dynamic multi-skill orchestration
- [ ] Skill context management
- [ ] Improved tool execution and error handling
- [ ] Conversation-level memory management
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
