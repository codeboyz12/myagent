from abc import ABC, abstractmethod

class BaseLLMAdapter(ABC):

    @abstractmethod
    def generate(self, messages, tools=None):
        pass