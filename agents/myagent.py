from tools import get_tool_registry, get_tool_schemas
import json

TOOL_REGISTRY = get_tool_registry()
TOOL_SCHEMAS = get_tool_schemas()


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


def handle_tool_calls(tool_calls, messages):

    for tool_call in tool_calls:

        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        print(f"[tool] {name}({args})")

        if name not in TOOL_REGISTRY:
            result = f"Error: unknown tool '{name}'"

        else:
            try:
                result = TOOL_REGISTRY[name](**args)
                result = str(result)

            except Exception as e:
                result = f"Tool execution error: {e}"

        print(f"[tool result] {result[:200]}")

        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result,
        })


def myagent(model):

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    while True:

        text = input("\nYou: ")

        if text.lower() == "exit":
            break

        messages.append({
            "role": "user",
            "content": text
        })

        while True:

            response = model.generate(
                messages,
                tools=TOOL_SCHEMAS
            )

            # Preserve the complete assistant message,
            # including tool_calls.
            messages.append(
                response.model_dump(exclude_none=True)
            )

            if response.tool_calls:

                handle_tool_calls(
                    response.tool_calls,
                    messages
                )

                continue

            print("-" * 50)
            print("Assistant:", response.content)
            print("-" * 50)

            break