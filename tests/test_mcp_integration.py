"""Opt-in integration against a running local SearXNG and mcp-searxng."""

from __future__ import annotations

import asyncio
import json
import os
from urllib.request import urlopen

import pytest

from myagent.tools.mcp import (
    MCPServerConfig,
    MCPToolAdapter,
    REQUIRED_SEARXNG_TOOLS,
)
from myagent.sessions.manager import _tool_images

pytestmark = pytest.mark.skipif(
    os.getenv("SEARXNG_INTEGRATION_TEST") != "1",
    reason="set SEARXNG_INTEGRATION_TEST=1 to use local Docker and outbound web access",
)


def test_local_searxng_mcp_discovery_search_read_and_private_url_block():
    searxng_url = os.getenv("SEARXNG_URL", "http://127.0.0.1:8080")
    with urlopen(f"{searxng_url.rstrip('/')}/search?q=SearXNG&format=json", timeout=10) as response:
        assert response.status == 200
        assert "results" in json.loads(response.read())

    async def exercise():
        server = MCPServerConfig(id="searxng", name="SearXNG", transport="stdio", builtin=True)
        adapter = MCPToolAdapter(searxng_url=searxng_url, timeout_seconds=60)
        tools = await adapter.list_tools(server)
        assert REQUIRED_SEARXNG_TOOLS.issubset({tool.name for tool in tools})

        search = await adapter.call_tool(
            server, "searxng_web_search",
            {"query": "SearXNG search API JSON format", "page": 1},
        )
        search_result = json.loads(search.split(". ", 1)[1])
        assert search_result.get("sources")
        assert all(source["url"].startswith(("http://", "https://")) for source in search_result["sources"])

        image_search = await adapter.call_tool(
            server, "searxng_web_search",
            {"query": "Kyoto Kiyomizu dera", "categories": "images",
             "response_format": "json", "result_detail": "full", "num_results": 3},
        )
        image_results = _tool_images(
            "searxng_web_search", {"categories": "images"}, image_search,
        )
        assert image_results
        assert all(
            item["url"].startswith("https://") and item["source_url"].startswith("https://")
            for item in image_results
        )

        page = await adapter.call_tool(
            server, "web_url_read", {"url": "https://docs.searxng.org/dev/search_api.html"},
        )
        assert "Search API" in page
        blocked = await adapter.call_tool(
            server, "web_url_read", {"url": "http://127.0.0.1:5000/health"},
        )
        assert "blocked by security policy" in blocked.lower()

    asyncio.run(exercise())
