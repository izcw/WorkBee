from __future__ import annotations

import threading
from typing import Annotated, Any, Callable, Dict, List, TypedDict

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class RunCancelled(RuntimeError):
    pass


class GraphState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]


class SingleAgentGraph:
    """One model step wrapped in LangGraph; the runtime owns the guarded tool loop."""

    def __init__(self, *, api_key: str, base_url: str, model: str, tools: List[Dict[str, Any]],
                 on_delta: Callable[[str], None], cancel_event: threading.Event, streaming: bool = True,
                 temperature: float = 0.1, timeout: float = 90, max_retries: int = 2,
                 max_tokens: int | None = None) -> None:
        chat = ChatOpenAI(
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=temperature,
            streaming=streaming,
            timeout=timeout,
            max_retries=max_retries,
            max_tokens=max_tokens,
        )
        self._model = chat.bind_tools(tools) if tools else chat
        self._on_delta = on_delta
        self._cancel_event = cancel_event
        self._streaming = streaming
        builder = StateGraph(GraphState)
        builder.add_node("model", self._model_step)
        builder.add_edge(START, "model")
        builder.add_edge("model", END)
        self._graph = builder.compile()

    def _model_step(self, state: GraphState) -> Dict[str, List[BaseMessage]]:
        if not self._streaming:
            if self._cancel_event.is_set():
                raise RunCancelled("Run was cancelled")
            return {"messages": [self._model.invoke(state["messages"])]}
        complete = None
        for chunk in self._model.stream(state["messages"]):
            if self._cancel_event.is_set():
                raise RunCancelled("Run was cancelled")
            content = chunk.content
            if isinstance(content, str) and content:
                self._on_delta(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and isinstance(block.get("text"), str):
                        self._on_delta(block["text"])
            complete = chunk if complete is None else complete + chunk
        if complete is None:
            raise RuntimeError("Model returned an empty stream")
        return {"messages": [complete]}

    def invoke(self, messages: List[BaseMessage]) -> BaseMessage:
        result = self._graph.invoke({"messages": messages})
        return result["messages"][-1]
