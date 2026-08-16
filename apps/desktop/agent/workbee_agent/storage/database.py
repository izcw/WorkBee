from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ..protocol import utc_now


class Database:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(str(path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._migrate()

    def _migrate(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                """
                PRAGMA journal_mode=WAL;
                PRAGMA foreign_keys=ON;
                CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS workspaces(
                  id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL, last_opened_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS threads(
                  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
                );
                CREATE TABLE IF NOT EXISTS messages(
                  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, run_id TEXT, role TEXT NOT NULL, role_id TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL,
                  FOREIGN KEY(thread_id) REFERENCES threads(id)
                );
                CREATE TABLE IF NOT EXISTS runs(
                  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL, role_id TEXT NOT NULL DEFAULT 'workbee', error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  FOREIGN KEY(thread_id) REFERENCES threads(id)
                );
                CREATE TABLE IF NOT EXISTS approvals(
                  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments_json TEXT NOT NULL, status TEXT NOT NULL,
                  created_at TEXT NOT NULL, resolved_at TEXT
                );
                CREATE TABLE IF NOT EXISTS checkpoints(
                  run_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS token_usage(
                  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, thread_id TEXT NOT NULL, role_id TEXT NOT NULL,
                  model_id TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
                  output_tokens INTEGER NOT NULL DEFAULT 0, total_tokens INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
                CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model_id);
                CREATE TABLE IF NOT EXISTS agent_tasks(
                  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role_id TEXT NOT NULL, role_name TEXT NOT NULL,
                  goal TEXT NOT NULL, status TEXT NOT NULL, output TEXT, error TEXT,
                  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_tasks_run ON agent_tasks(run_id);
                CREATE TABLE IF NOT EXISTS knowledge_documents(
                  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, path TEXT NOT NULL, content_hash TEXT NOT NULL,
                  modified_ns INTEGER NOT NULL, size_bytes INTEGER NOT NULL, indexed_at TEXT NOT NULL,
                  UNIQUE(workspace_id, path), FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
                );
                CREATE TABLE IF NOT EXISTS knowledge_chunks(
                  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, workspace_id TEXT NOT NULL, path TEXT NOT NULL,
                  ordinal INTEGER NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, content TEXT NOT NULL,
                  embedding_json TEXT, embedding_model TEXT,
                  FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
                  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
                );
                CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace ON knowledge_chunks(workspace_id);
                CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
                  chunk_id UNINDEXED, workspace_id UNINDEXED, path, content, tokenize='unicode61'
                );
                INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));
                """
            )
            columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(runs)").fetchall()}
            if "role_id" not in columns:
                self._connection.execute("ALTER TABLE runs ADD COLUMN role_id TEXT NOT NULL DEFAULT 'workbee'")
            message_columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(messages)").fetchall()}
            if "role_id" not in message_columns:
                self._connection.execute("ALTER TABLE messages ADD COLUMN role_id TEXT")
            knowledge_columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(knowledge_chunks)").fetchall()}
            if "embedding_json" not in knowledge_columns:
                self._connection.execute("ALTER TABLE knowledge_chunks ADD COLUMN embedding_json TEXT")
            if "embedding_model" not in knowledge_columns:
                self._connection.execute("ALTER TABLE knowledge_chunks ADD COLUMN embedding_model TEXT")

    def select_workspace(self, path: Path, name: Optional[str] = None) -> Dict[str, Any]:
        resolved = path.expanduser().resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("Workspace must be a directory")
        now = utc_now()
        with self._lock, self._connection:
            row = self._connection.execute("SELECT * FROM workspaces WHERE path = ?", (str(resolved),)).fetchone()
            if row:
                self._connection.execute("UPDATE workspaces SET last_opened_at = ? WHERE id = ?", (now, row["id"]))
                workspace_id = row["id"]
            else:
                workspace_id = str(uuid4())
                self._connection.execute(
                    "INSERT INTO workspaces(id,path,name,created_at,last_opened_at) VALUES(?,?,?,?,?)",
                    (workspace_id, str(resolved), name or resolved.name, now, now),
                )
        return {"id": workspace_id, "path": str(resolved), "name": name or (row["name"] if row else resolved.name)}

    def get_workspace(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._connection.execute("SELECT id,path,name FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        return dict(row) if row else None

    def list_workspaces(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT w.id,w.path,w.name,w.created_at,w.last_opened_at,COUNT(t.id) thread_count "
                "FROM workspaces w LEFT JOIN threads t ON t.workspace_id=w.id "
                "GROUP BY w.id ORDER BY w.last_opened_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def create_thread(self, workspace_id: str, prompt: str) -> str:
        thread_id = str(uuid4())
        now = utc_now()
        title = " ".join(prompt.strip().split())[:32] or "新对话"
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO threads(id,workspace_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
                (thread_id, workspace_id, title, now, now),
            )
        return thread_id

    def create_run(self, thread_id: str, prompt: str, mode: str, role_id: str = "workbee") -> str:
        run_id = str(uuid4())
        now = utc_now()
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO runs(id,thread_id,status,mode,role_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (run_id, thread_id, "queued", mode, role_id, now, now),
            )
            self._connection.execute(
                "INSERT INTO messages(id,thread_id,run_id,role,role_id,content,created_at) VALUES(?,?,?,?,?,?,?)",
                (str(uuid4()), thread_id, run_id, "user", None, prompt, now),
            )
            title = " ".join(prompt.strip().split())[:32] or "新对话"
            self._connection.execute(
                "UPDATE threads SET title=CASE WHEN title='新对话' THEN ? ELSE title END,updated_at=? WHERE id=?",
                (title, now, thread_id),
            )
        return run_id

    def set_run_status(self, run_id: str, status: str, error: Optional[str] = None) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?",
                (status, error, utc_now(), run_id),
            )

    def set_run_role(self, run_id: str, role_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute("UPDATE runs SET role_id = ?, updated_at = ? WHERE id = ?", (role_id, utc_now(), run_id))

    def add_message(self, thread_id: str, run_id: str, role: str, content: str, role_id: Optional[str] = None) -> None:
        now = utc_now()
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO messages(id,thread_id,run_id,role,role_id,content,created_at) VALUES(?,?,?,?,?,?,?)",
                (str(uuid4()), thread_id, run_id, role, role_id, content, now),
            )
            self._connection.execute("UPDATE threads SET updated_at = ? WHERE id = ?", (now, thread_id))

    def create_approval(self, run_id: str, tool_name: str, arguments: Dict[str, Any]) -> str:
        approval_id = str(uuid4())
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO approvals(id,run_id,tool_name,arguments_json,status,created_at) VALUES(?,?,?,?,?,?)",
                (approval_id, run_id, tool_name, json.dumps(arguments, ensure_ascii=False), "pending", utc_now()),
            )
        return approval_id

    def resolve_approval(self, approval_id: str, approved: bool) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
                ("approved" if approved else "denied", utc_now(), approval_id),
            )

    def save_checkpoint(self, run_id: str, state: Dict[str, Any]) -> None:
        with self._lock, self._connection:
            existing = self._connection.execute(
                "SELECT state_json FROM checkpoints WHERE run_id=?", (run_id,)
            ).fetchone()
            merged: Dict[str, Any] = {}
            if existing:
                try:
                    merged = json.loads(existing["state_json"])
                except (json.JSONDecodeError, TypeError):
                    merged = {}
            merged.update(state)
            self._connection.execute(
                "INSERT INTO checkpoints(run_id,state_json,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(run_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",
                (run_id, json.dumps(merged, ensure_ascii=False), utc_now()),
            )

    def get_checkpoint(self, run_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._connection.execute(
                "SELECT state_json FROM checkpoints WHERE run_id=?", (run_id,)
            ).fetchone()
        if not row:
            return None
        try:
            value = json.loads(row["state_json"])
            return value if isinstance(value, dict) else None
        except (json.JSONDecodeError, TypeError):
            return None

    def interrupt_incomplete_runs(self) -> int:
        with self._lock, self._connection:
            rows = self._connection.execute(
                "SELECT id FROM runs WHERE status IN ('running','waiting_approval','queued')"
            ).fetchall()
            if rows:
                self._connection.execute(
                    "UPDATE runs SET status='interrupted',error='应用退出前任务未完成',updated_at=? "
                    "WHERE status IN ('running','waiting_approval','queued')", (utc_now(),)
                )
                self._connection.execute(
                    "UPDATE approvals SET status='expired',resolved_at=? WHERE status='pending'", (utc_now(),)
                )
        return len(rows)

    def list_recoverable_runs(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT r.id,r.thread_id,r.role_id,r.mode,r.updated_at,t.workspace_id,t.title "
                "FROM runs r JOIN threads t ON t.id=r.thread_id "
                "WHERE r.status='interrupted' ORDER BY r.updated_at DESC"
            ).fetchall()
        result = []
        for row in rows:
            checkpoint = self.get_checkpoint(row["id"]) or {}
            item = dict(row)
            item["safeToResume"] = not bool(
                checkpoint.get("sideEffectStarted") or checkpoint.get("sideEffectsCompleted")
            )
            item["phase"] = str(checkpoint.get("status") or "unknown")
            result.append(item)
        return result

    def prepare_run_resume(self, run_id: str) -> Optional[Dict[str, Any]]:
        checkpoint = self.get_checkpoint(run_id)
        if not checkpoint or checkpoint.get("sideEffectStarted") or checkpoint.get("sideEffectsCompleted"):
            return None
        with self._lock, self._connection:
            row = self._connection.execute(
                "SELECT r.id,r.thread_id,t.workspace_id FROM runs r JOIN threads t ON t.id=r.thread_id "
                "WHERE r.id=? AND r.status='interrupted'", (run_id,)
            ).fetchone()
            if not row:
                return None
            self._connection.execute(
                "UPDATE runs SET status='queued',error=NULL,updated_at=? WHERE id=?", (utc_now(), run_id)
            )
        return {**dict(row), **checkpoint}

    def create_agent_task(self, run_id: str, role_id: str, role_name: str, goal: str) -> str:
        task_id = str(uuid4())
        now = utc_now()
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO agent_tasks(id,run_id,role_id,role_name,goal,status,created_at,updated_at) "
                "VALUES(?,?,?,?,?,'queued',?,?)",
                (task_id, run_id, role_id, role_name, goal[:4000], now, now),
            )
        return task_id

    def update_agent_task(self, task_id: str, status: str, output: str = "", error: str = "") -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE agent_tasks SET status=?,output=?,error=?,updated_at=? WHERE id=?",
                (status, output[:65536] or None, error[:2000] or None, utc_now(), task_id),
            )

    def knowledge_document_hash(self, workspace_id: str, path: str) -> Optional[str]:
        with self._lock:
            row = self._connection.execute(
                "SELECT content_hash FROM knowledge_documents WHERE workspace_id=? AND path=?",
                (workspace_id, path),
            ).fetchone()
        return str(row["content_hash"]) if row else None

    def replace_knowledge_document(self, workspace_id: str, path: str, content_hash: str,
                                   modified_ns: int, size_bytes: int, chunks: List[Dict[str, Any]]) -> None:
        now = utc_now()
        with self._lock, self._connection:
            row = self._connection.execute(
                "SELECT id FROM knowledge_documents WHERE workspace_id=? AND path=?",
                (workspace_id, path),
            ).fetchone()
            document_id = str(row["id"]) if row else str(uuid4())
            if row:
                chunk_ids = [
                    item["id"] for item in self._connection.execute(
                        "SELECT id FROM knowledge_chunks WHERE document_id=?", (document_id,)
                    ).fetchall()
                ]
                if chunk_ids:
                    placeholders = ",".join("?" for _ in chunk_ids)
                    self._connection.execute(
                        f"DELETE FROM knowledge_chunks_fts WHERE chunk_id IN ({placeholders})", chunk_ids
                    )
                self._connection.execute("DELETE FROM knowledge_chunks WHERE document_id=?", (document_id,))
                self._connection.execute(
                    "UPDATE knowledge_documents SET content_hash=?,modified_ns=?,size_bytes=?,indexed_at=? WHERE id=?",
                    (content_hash, modified_ns, size_bytes, now, document_id),
                )
            else:
                self._connection.execute(
                    "INSERT INTO knowledge_documents(id,workspace_id,path,content_hash,modified_ns,size_bytes,indexed_at) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (document_id, workspace_id, path, content_hash, modified_ns, size_bytes, now),
                )
            for ordinal, chunk in enumerate(chunks):
                chunk_id = str(uuid4())
                values = (
                    chunk_id, document_id, workspace_id, path, ordinal,
                    int(chunk["start_line"]), int(chunk["end_line"]), str(chunk["content"]),
                    json.dumps(chunk.get("embedding")) if chunk.get("embedding") else None,
                    str(chunk.get("embedding_model") or "") or None,
                )
                self._connection.execute(
                    "INSERT INTO knowledge_chunks(id,document_id,workspace_id,path,ordinal,start_line,end_line,content,embedding_json,embedding_model) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)", values,
                )
                self._connection.execute(
                    "INSERT INTO knowledge_chunks_fts(chunk_id,workspace_id,path,content) VALUES(?,?,?,?)",
                    (chunk_id, workspace_id, path, str(chunk["content"])),
                )

    def remove_missing_knowledge_documents(self, workspace_id: str, seen_paths: set[str]) -> int:
        with self._lock, self._connection:
            rows = self._connection.execute(
                "SELECT id,path FROM knowledge_documents WHERE workspace_id=?", (workspace_id,)
            ).fetchall()
            missing = [row for row in rows if row["path"] not in seen_paths]
            for row in missing:
                chunk_ids = [
                    item["id"] for item in self._connection.execute(
                        "SELECT id FROM knowledge_chunks WHERE document_id=?", (row["id"],)
                    ).fetchall()
                ]
                if chunk_ids:
                    placeholders = ",".join("?" for _ in chunk_ids)
                    self._connection.execute(
                        f"DELETE FROM knowledge_chunks_fts WHERE chunk_id IN ({placeholders})", chunk_ids
                    )
                self._connection.execute("DELETE FROM knowledge_chunks WHERE document_id=?", (row["id"],))
                self._connection.execute("DELETE FROM knowledge_documents WHERE id=?", (row["id"],))
        return len(missing)

    def search_knowledge(self, workspace_id: str, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        latin = re.findall(r"[A-Za-z0-9_./-]{2,}", query)
        chinese: List[str] = []
        for value in re.findall(r"[\u4e00-\u9fff]{2,}", query):
            if len(value) <= 4:
                chinese.append(value)
            else:
                chinese.extend(value[index:index + 2] for index in range(len(value) - 1))
        terms = list(dict.fromkeys([*latin, *chinese]))[:12]
        with self._lock:
            rows: List[sqlite3.Row] = []
            if terms:
                fts_query = " OR ".join(f'"{term.replace(chr(34), "")}"' for term in terms)
                try:
                    rows = self._connection.execute(
                        "SELECT c.id,c.path,c.start_line,c.end_line,c.content,bm25(knowledge_chunks_fts) score "
                        "FROM knowledge_chunks_fts JOIN knowledge_chunks c ON c.id=knowledge_chunks_fts.chunk_id "
                        "WHERE knowledge_chunks_fts MATCH ? AND c.workspace_id=? ORDER BY score LIMIT ?",
                        (fts_query, workspace_id, limit),
                    ).fetchall()
                except sqlite3.OperationalError:
                    rows = []
            if not rows:
                like_terms = terms or [query[:100]]
                clauses = " OR ".join("content LIKE ?" for _ in like_terms)
                rows = self._connection.execute(
                    f"SELECT id,path,start_line,end_line,content,0 score FROM knowledge_chunks "
                    f"WHERE workspace_id=? AND ({clauses}) ORDER BY path,ordinal LIMIT ?",
                    (workspace_id, *(f"%{term}%" for term in like_terms), limit),
                ).fetchall()
        return [dict(row) for row in rows]

    def vector_knowledge_chunks(self, workspace_id: str, embedding_model: str,
                                limit: int = 4000) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT id,path,start_line,end_line,content,embedding_json FROM knowledge_chunks "
                "WHERE workspace_id=? AND embedding_model=? AND embedding_json IS NOT NULL LIMIT ?",
                (workspace_id, embedding_model, limit),
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            try:
                item["embedding"] = json.loads(item.pop("embedding_json"))
            except (json.JSONDecodeError, TypeError):
                continue
            result.append(item)
        return result

    def record_token_usage(self, run_id: str, thread_id: str, role_id: str, model_id: str, model: str,
                           input_tokens: int, output_tokens: int, total_tokens: int) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "INSERT INTO token_usage(id,run_id,thread_id,role_id,model_id,model,input_tokens,output_tokens,total_tokens,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (str(uuid4()), run_id, thread_id, role_id, model_id, model, max(0, input_tokens), max(0, output_tokens), max(0, total_tokens), utc_now()),
            )

    def usage_summary(self) -> Dict[str, Any]:
        with self._lock:
            total = self._connection.execute("SELECT COALESCE(SUM(total_tokens),0) total FROM token_usage").fetchone()["total"]
            peak = self._connection.execute("SELECT COALESCE(MAX(tokens),0) peak FROM (SELECT run_id,SUM(total_tokens) tokens FROM token_usage GROUP BY run_id)").fetchone()["peak"]
            longest = self._connection.execute(
                "SELECT COALESCE(MAX((julianday(updated_at)-julianday(created_at))*86400),0) seconds FROM runs WHERE status IN ('completed','failed','cancelled')"
            ).fetchone()["seconds"]
            models = self._connection.execute(
                "SELECT model_id,model,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(total_tokens) total_tokens,COUNT(DISTINCT run_id) conversations FROM token_usage GROUP BY model_id,model ORDER BY total_tokens DESC"
            ).fetchall()
            daily = self._connection.execute(
                "SELECT substr(created_at,1,10) date,SUM(total_tokens) tokens,COUNT(DISTINCT run_id) conversations FROM token_usage WHERE created_at >= datetime('now','-370 days') GROUP BY substr(created_at,1,10) ORDER BY date"
            ).fetchall()
        return {"totalTokens": int(total or 0), "peakTokens": int(peak or 0), "longestTaskSeconds": int(longest or 0),
                "byModel": [dict(row) for row in models], "daily": [dict(row) for row in daily]}

    def list_threads(self, workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = "SELECT t.*, w.name workspace_name FROM threads t JOIN workspaces w ON w.id=t.workspace_id"
        params: tuple = ()
        if workspace_id:
            query += " WHERE t.workspace_id = ?"
            params = (workspace_id,)
        query += " ORDER BY t.updated_at DESC LIMIT 100"
        with self._lock:
            rows = self._connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            thread = self._connection.execute("SELECT * FROM threads WHERE id = ?", (thread_id,)).fetchone()
            if not thread:
                return None
            messages = self._connection.execute(
                "SELECT id,run_id,role,role_id,content,created_at FROM messages WHERE thread_id = ? ORDER BY created_at,id", (thread_id,)
            ).fetchall()
            runs = self._connection.execute(
                "SELECT id,status,mode,role_id,error,created_at,updated_at FROM runs WHERE thread_id = ? ORDER BY created_at", (thread_id,)
            ).fetchall()
            approvals = self._connection.execute(
                "SELECT a.id,a.run_id,a.tool_name,a.arguments_json,a.status,a.created_at FROM approvals a "
                "JOIN runs r ON r.id=a.run_id WHERE r.thread_id=? ORDER BY a.created_at", (thread_id,)
            ).fetchall()
            agent_tasks = self._connection.execute(
                "SELECT id,run_id,role_id,role_name,goal,status,output,error,created_at,updated_at "
                "FROM agent_tasks WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?) ORDER BY created_at",
                (thread_id,),
            ).fetchall()
        result = dict(thread)
        result["messages"] = [dict(row) for row in messages]
        result["runs"] = [dict(row) for row in runs]
        result["approvals"] = [dict(row) for row in approvals]
        result["agent_tasks"] = [dict(row) for row in agent_tasks]
        return result

    def delete_thread(self, thread_id: str) -> bool:
        with self._lock, self._connection:
            exists = self._connection.execute("SELECT 1 FROM threads WHERE id=?", (thread_id,)).fetchone()
            if not exists:
                return False
            self._connection.execute("DELETE FROM approvals WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?)", (thread_id,))
            self._connection.execute("DELETE FROM checkpoints WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?)", (thread_id,))
            self._connection.execute("DELETE FROM token_usage WHERE thread_id=?", (thread_id,))
            self._connection.execute("DELETE FROM agent_tasks WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?)", (thread_id,))
            self._connection.execute("DELETE FROM messages WHERE thread_id=?", (thread_id,))
            self._connection.execute("DELETE FROM runs WHERE thread_id=?", (thread_id,))
            self._connection.execute("DELETE FROM threads WHERE id=?", (thread_id,))
        return True

    def delete_workspace(self, workspace_id: str) -> bool:
        with self._lock, self._connection:
            exists = self._connection.execute("SELECT 1 FROM workspaces WHERE id=?", (workspace_id,)).fetchone()
            if not exists:
                return False
            thread_ids = [row["id"] for row in self._connection.execute("SELECT id FROM threads WHERE workspace_id=?", (workspace_id,)).fetchall()]
            for thread_id in thread_ids:
                self.delete_thread(thread_id)
            documents = self._connection.execute(
                "SELECT id FROM knowledge_documents WHERE workspace_id=?", (workspace_id,)
            ).fetchall()
            for document in documents:
                chunk_ids = [
                    item["id"] for item in self._connection.execute(
                        "SELECT id FROM knowledge_chunks WHERE document_id=?", (document["id"],)
                    ).fetchall()
                ]
                if chunk_ids:
                    placeholders = ",".join("?" for _ in chunk_ids)
                    self._connection.execute(
                        f"DELETE FROM knowledge_chunks_fts WHERE chunk_id IN ({placeholders})", chunk_ids
                    )
            self._connection.execute("DELETE FROM knowledge_chunks WHERE workspace_id=?", (workspace_id,))
            self._connection.execute("DELETE FROM knowledge_documents WHERE workspace_id=?", (workspace_id,))
            self._connection.execute("DELETE FROM workspaces WHERE id=?", (workspace_id,))
        return True

    def rename_workspace(self, workspace_id: str, name: str) -> bool:
        with self._lock, self._connection:
            cursor = self._connection.execute("UPDATE workspaces SET name=? WHERE id=?", (name, workspace_id))
        return cursor.rowcount > 0

    def close(self) -> None:
        with self._lock:
            self._connection.close()
