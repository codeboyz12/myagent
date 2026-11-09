import os
import unittest
from unittest.mock import patch

from ai.providers.openai import OpenAIChatCompletionsProtocol

from myagent.adapter.ai_sdk import create_model


class ModelAdapterTests(unittest.TestCase):
    def test_openai_compatible_endpoint_uses_chat_completions(self):
        with patch.dict(
            os.environ,
            {
                "GROQ_API_KEY": "test-key",
                "GROQ_BASE_URL": "http://localhost:4000/v1",
                "GROQ_MODEL": "test-model",
            },
        ):
            model = create_model()

        self.assertIsInstance(model.provider.protocol, OpenAIChatCompletionsProtocol)


if __name__ == "__main__":
    unittest.main()
