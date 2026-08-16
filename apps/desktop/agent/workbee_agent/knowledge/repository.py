from __future__ import annotations

import hashlib
import fnmatch
import math
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List

from ..storage import Database
from .embeddings import EmbeddingProvider


TEXT_EXTENSIONS = {
    ".c", ".cc", ".cpp", ".css", ".go", ".h", ".hpp", ".html", ".java", ".js", ".json",
    ".jsx", ".md", ".mjs", ".py", ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt",
    ".vue", ".yaml", ".yml",
}
IGNORED_PARTS = {
    ".git", ".idea", ".venv", "__pycache__", "build", "coverage", "dist", "node_modules", "release",
}


class KnowledgeRepository:
    """Incremental, workspace-scoped local retrieval over text and source files."""

    def __init__(self, database: Database, workspace_id: str, workspace: Path,
                 embedder: EmbeddingProvider | None = None) -> None:
        self.database = database
        self.workspace_id = workspace_id
        self.workspace = workspace.resolve(strict=True)
        self.embedder = embedder

    def index(self, selected_paths: Iterable[str] = ()) -> Dict[str, int]:
        candidates = self._candidate_files(selected_paths)
        seen: set[str] = set()
        indexed = 0
        unchanged = 0
        skipped = 0
        for path in candidates:
            relative = path.relative_to(self.workspace).as_posix()
            seen.add(relative)
            try:
                raw = path.read_bytes()
            except OSError:
                skipped += 1
                continue
            if len(raw) > 1024 * 1024 or b"\x00" in raw[:8192]:
                skipped += 1
                continue
            try:
                content = raw.decode("utf-8")
            except UnicodeDecodeError:
                skipped += 1
                continue
            raw_digest = hashlib.sha256(raw).hexdigest()
            digest = f"{raw_digest}:{self.embedder.model_id}" if self.embedder else raw_digest
            if self.database.knowledge_document_hash(self.workspace_id, relative) == digest:
                unchanged += 1
                continue
            chunks = list(self._chunks(content))
            if not chunks:
                skipped += 1
                continue
            if self.embedder:
                try:
                    embeddings = self.embedder.documents([item["content"] for item in chunks])
                    for chunk, embedding in zip(chunks, embeddings):
                        chunk["embedding"] = embedding
                        chunk["embedding_model"] = self.embedder.model_id
                except Exception:
                    digest = raw_digest
            self.database.replace_knowledge_document(
                self.workspace_id, relative, digest, path.stat().st_mtime_ns, len(raw), chunks
            )
            indexed += 1
        removed = self.database.remove_missing_knowledge_documents(self.workspace_id, seen)
        return {
            "files": len(candidates), "indexed": indexed, "unchanged": unchanged,
            "skipped": skipped, "removed": removed,
        }

    def search(self, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        cleaned = " ".join(query.split())[:500]
        if not cleaned:
            return []
        limit = max(1, min(limit, 12))
        lexical = self.database.search_knowledge(self.workspace_id, cleaned, limit * 3)
        if not self.embedder:
            return lexical[:limit]
        try:
            query_vector = self.embedder.query(cleaned)
            vector_rows = self.database.vector_knowledge_chunks(self.workspace_id, self.embedder.model_id)
        except Exception:
            return lexical[:limit]
        vector_ranked = sorted(
            vector_rows,
            key=lambda item: self._cosine(query_vector, item["embedding"]),
            reverse=True,
        )[:limit * 3]
        scores: Dict[str, float] = {}
        rows: Dict[str, Dict[str, Any]] = {}
        for rank, item in enumerate(lexical, 1):
            rows[item["id"]] = item
            scores[item["id"]] = scores.get(item["id"], 0) + 1 / (60 + rank)
        for rank, item in enumerate(vector_ranked, 1):
            rows[item["id"]] = item
            scores[item["id"]] = scores.get(item["id"], 0) + 1 / (60 + rank)
        ordered = sorted(scores, key=scores.get, reverse=True)
        return [rows[item] for item in ordered[:limit]]

    def format_results(self, query: str, limit: int = 6) -> str:
        results = self.search(query, limit)
        if not results:
            return "未在当前工作区知识索引中找到相关内容。"
        sections = []
        for index, item in enumerate(results, 1):
            location = f"{item['path']}:{item['start_line']}"
            sections.append(f"[{index}] {location}\n{item['content']}")
        return "\n\n".join(sections)

    def _candidate_files(self, selected_paths: Iterable[str]) -> List[Path]:
        ignore_rules = self._ignore_rules()
        selected: List[Path] = []
        for value in selected_paths:
            raw = Path(value)
            if raw.is_absolute() or ".." in raw.parts:
                continue
            try:
                path = (self.workspace / raw).resolve(strict=True)
                path.relative_to(self.workspace)
            except (FileNotFoundError, ValueError):
                continue
            if path.is_file() and self._eligible(path) and not self._is_ignored(path, ignore_rules):
                selected.append(path)

        files: List[Path] = []
        total_bytes = 0
        max_files = 200 if self.embedder else 500
        max_bytes = 5 * 1024 * 1024 if self.embedder else 20 * 1024 * 1024
        for path in sorted(self.workspace.rglob("*")):
            if len(files) >= max_files or total_bytes >= max_bytes:
                break
            try:
                relative = path.relative_to(self.workspace)
                if not path.is_file() or not self._eligible(path):
                    continue
                size = path.stat().st_size
            except OSError:
                continue
            if any(part in IGNORED_PARTS or part.startswith(".") for part in relative.parts):
                continue
            if self._is_ignored(path, ignore_rules):
                continue
            if size > 1024 * 1024:
                continue
            files.append(path)
            total_bytes += size
        return list(dict.fromkeys([*selected, *files]))

    def _ignore_rules(self) -> List[tuple[str, bool]]:
        """Read a practical gitignore subset from .gitignore and .workbeeignore."""
        rules: List[tuple[str, bool]] = []
        for name in (".gitignore", ".workbeeignore"):
            try:
                lines = (self.workspace / name).read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            for raw in lines[:2000]:
                value = raw.strip()
                if not value or value.startswith("#"):
                    continue
                negated = value.startswith("!")
                pattern = value[1:] if negated else value
                if pattern:
                    rules.append((pattern.replace("\\", "/").lstrip("/"), negated))
        return rules

    def _is_ignored(self, path: Path, rules: List[tuple[str, bool]]) -> bool:
        relative = path.relative_to(self.workspace).as_posix()
        ignored = False
        for pattern, negated in rules:
            directory_pattern = pattern.endswith("/")
            normalized = pattern.rstrip("/")
            matched = (
                fnmatch.fnmatch(relative, normalized)
                or fnmatch.fnmatch(relative, f"**/{normalized}")
                or (directory_pattern and (relative == normalized or relative.startswith(f"{normalized}/")))
                or ("/" not in normalized and any(fnmatch.fnmatch(part, normalized) for part in Path(relative).parts))
            )
            if matched:
                ignored = not negated
        return ignored

    @staticmethod
    def _eligible(path: Path) -> bool:
        return path.suffix.lower() in TEXT_EXTENSIONS or path.name in {
            "Dockerfile", "Makefile", "README", "LICENSE",
        }

    @staticmethod
    def _chunks(content: str, target_chars: int = 1400, overlap_lines: int = 3) -> Iterable[Dict[str, Any]]:
        lines = content.splitlines()
        start = 0
        while start < len(lines):
            end = start
            length = 0
            while end < len(lines) and (length < target_chars or end == start):
                length += len(lines[end]) + 1
                end += 1
            text = "\n".join(lines[start:end]).strip()
            if text:
                yield {
                    "start_line": start + 1,
                    "end_line": end,
                    "content": text[:4000],
                }
            next_start = max(start + 1, end - overlap_lines)
            start = next_start

    @staticmethod
    def _cosine(left: List[float], right: List[float]) -> float:
        if not left or len(left) != len(right):
            return -1.0
        dot = sum(a * b for a, b in zip(left, right))
        denominator = math.sqrt(sum(value * value for value in left)) * math.sqrt(sum(value * value for value in right))
        return dot / denominator if denominator else -1.0


def query_terms(value: str) -> List[str]:
    """Return conservative terms suitable for FTS and LIKE fallback."""
    latin = re.findall(r"[A-Za-z0-9_./-]{2,}", value)
    chinese = re.findall(r"[\u4e00-\u9fff]{2,}", value)
    return list(dict.fromkeys([*latin, *chinese]))[:12]
