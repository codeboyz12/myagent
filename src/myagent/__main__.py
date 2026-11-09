import asyncio

from dotenv import load_dotenv
from myagent.adapter.ai_sdk import create_model
from myagent.agents import myagent


def main():
    load_dotenv()
    asyncio.run(myagent(model=create_model()))


if __name__ == "__main__":
    main()
