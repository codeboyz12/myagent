"""Isolated API server with a deterministic model for browser integration tests."""

from __future__ import annotations

import os
from types import SimpleNamespace

import ai
import uvicorn

from myagent.api import create_app


class FakeStream:
    def __init__(self, messages: list[object]) -> None:
        self.messages = [*messages, ai.assistant_message("Synthetic backend response.")]
        self.output = "Synthetic backend response."

    async def __aenter__(self) -> FakeStream:
        return self

    async def __aexit__(self, exc_type: object, exc: object, traceback: object) -> bool:
        return False

    async def __aiter__(self):
        yield ai.events.StreamStart()
        yield ai.events.TextDelta(chunk=self.output)
        yield ai.events.StreamEnd(
            usage=ai.types.usage.Usage(
                input_tokens=11,
                output_tokens=7,
                raw={"prompt_tokens": 11, "completion_tokens": 7},
            )
        )


class FakeAgent:
    def run(self, model: object, messages: list[object], **kwargs: object) -> FakeStream:
        return FakeStream(messages)


app = create_app(
    model=SimpleNamespace(id="e2e-model"),
    agent_factory=lambda context: FakeAgent(),
    data_dir=os.environ["MYAGENT_DATA_DIR"],
    workspace_root=os.environ["MYAGENT_API_WORKSPACE_ROOT"],
    signup_enabled=True,
)

uvicorn.run(
    app,
    host=os.environ.get("MYAGENT_API_HOST", "127.0.0.1"),
    port=int(os.environ.get("MYAGENT_API_PORT", "5001")),
)
