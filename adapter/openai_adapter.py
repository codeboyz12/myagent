from adapter.base import BaseLLMAdapter
import os
from openai import OpenAI

class openAIAdapter(BaseLLMAdapter):
    def __init__(self, model="qwen/qwen3.8-27b"):
        self.client = OpenAI(
            base_url=os.getenv("GROQ_BASE_URL"),
            api_key=os.getenv("GROQ_API_KEY"),
        )
        self.model=model

    def generate(self, messages, tools=None, max_tonkens=512):
        kwargs = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tonkens
        }

        completion = self.client.chat.completions.create(
            **kwargs
        )

        response = completion.choices[0].message.content
        return response