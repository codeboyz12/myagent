from dotenv import load_dotenv
from adapter.openai_adapter import openAIAdapter
from agents import myagent

load_dotenv()

llm = openAIAdapter()

myagent(model=llm)