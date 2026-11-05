from tools import get_tool_registry, get_tool_schemas
import json

TOOL_REGISTRY = get_tool_registry()
TOOL_SCHEMAS = get_tool_schemas()

def handle_tool_calls(tool_calls, messages):
    """Execute each tool the LLM requested and append the results to messages."""
    for tool_call in tool_calls:
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        print(f"[tool] {name}({args})")

        if name not in TOOL_REGISTRY:
            result = f"Error: unknown tool '{name}'. Available tools: {list(TOOL_REGISTRY.keys())}"
        else:
            result = TOOL_REGISTRY[name](**args)

        print(f"[tool result] {result[:200]}{'...' if len(result) > 200 else ''}")

        # The LLM needs the result tied back to the specific tool call id
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result,
        })

def myagent(model):
    messages = [
        {
            "role": "system",
            "content": "You are \"myagent\". the assistant for negotiation."
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

            messages.append(response)

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