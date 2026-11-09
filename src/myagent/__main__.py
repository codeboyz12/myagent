from dotenv import load_dotenv
from myagent.adapter.openai_adapter import openAIAdapter
from myagent.agents import myagent

load_dotenv()

llm = openAIAdapter()

def main():
    myagent(model=llm)


if __name__ == "__main__":
    main()
