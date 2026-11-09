import ai

from myagent.sessions import SessionBusy, SessionManager


SYSTEM_PROMPT = """
You are myagent, an AI assistant that helps users communicate
and evaluate ideas through ethical, evidence-based persuasion.

You have access to Skills and Tools.

## Skill Selection

You are responsible for deciding which Skills are relevant.

When a task requires specialized knowledge:

1. Call list_skills to discover available Skills.
2. Analyze the available Skill descriptions.
3. Select the relevant Skill or Skills.
4. Call load_skill to load their instructions.
5. Follow the loaded instructions.

Do not load every Skill unnecessarily.

## Persona

Use persona-manager when relevant to understand and maintain
the conversation partner's explicitly shared preferences,
goals, priorities, and concerns.

Do not invent personal information or infer sensitive attributes.

## Persuasion

You have two persuasion approaches:

- comparative-persuasion:
  Fairly compare similar products or alternatives.

- relevance-persuasion:
  Explain how an idea or product relates to the person's
  explicitly stated needs and goals.

Choose based on the current context.

Do not manipulate, pressure, or exploit vulnerabilities.

## Tool Usage

When a tool returns a result, examine it before deciding
what to do next.

Continue using tools when necessary.

Do not claim that an operation succeeded unless the tool
confirms it.
"""


async def myagent(
    model: ai.Model,
    sessions: SessionManager,
    session_id: str,
) -> None:
    while True:
        text = input("\nYou: ")
        if text.lower() == "exit":
            break
        if not text.strip():
            continue

        try:
            await sessions.run_turn(
                session_id,
                text,
                model,
                on_event=_render_event,
            )
        except SessionBusy as error:
            print(error)
            break
        print("\n" + "-" * 50)


def _render_event(event: ai.events.AgentEvent) -> None:
    if isinstance(event, ai.events.ToolStart):
        print(f"\n[tool] {event.tool_name}")
    elif isinstance(event, ai.events.TextDelta):
        print(event.chunk, end="", flush=True)
