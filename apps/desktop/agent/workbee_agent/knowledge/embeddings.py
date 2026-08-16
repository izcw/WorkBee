from __future__ import annotations

import json
from typing import Any, Dict, List

from langchain_openai import OpenAIEmbeddings


class EmbeddingProvider:
    def __init__(self, config: Dict[str, Any]) -> None:
        self.model_id = str(config.get("id") or config.get("model") or "embedding")
        self.model = str(config["model"])
        self._client = OpenAIEmbeddings(
            api_key=str(config["apiKey"]),
            base_url=str(config["baseUrl"]),
            model=self.model,
            timeout=60,
            max_retries=1,
        )

    @classmethod
    def from_environment(cls, raw: str) -> "EmbeddingProvider | None":
        if not raw:
            return None
        try:
            config = json.loads(raw)
            if not all(config.get(key) for key in ("apiKey", "baseUrl", "model")):
                return None
            return cls(config)
        except (json.JSONDecodeError, TypeError, ValueError):
            return None

    def documents(self, texts: List[str]) -> List[List[float]]:
        result: List[List[float]] = []
        for index in range(0, len(texts), 64):
            result.extend(self._client.embed_documents(texts[index:index + 64]))
        return result

    def query(self, text: str) -> List[float]:
        return self._client.embed_query(text)
