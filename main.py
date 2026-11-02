from dotenv import load_dotenv
from adapter.openai_adapter import openAIAdapter

load_dotenv()

llm = openAIAdapter()

messages = [
    {
        "role": "system",
        "content": "You are \"myagent\". the assistant for negotiation."
    }
]

while True:
    text = input("You: ")

    messages.append({"role": "user", "content": text})

    response = llm.generate(messages)

    print("Assistant: ", response)

    messages.append({"role": "assistant", "content": response})