from __future__ import annotations

import json
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
                  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, status TEXT NOT NULL, mode TEXT NOT NULL, role_id TEXT NOT NULL DEFAULT 'aivra', error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
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
                INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));
                """
            )
            columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(runs)").fetchall()}
            if "role_id" not in columns:
                self._connection.execute("ALTER TABLE runs ADD COLUMN role_id TEXT NOT NULL DEFAULT 'aivra'")
            message_columns = {row["name"] for row in self._connection.execute("PRAGMA table_info(messages)").fetchall()}
            if "role_id" not in message_columns:
                self._connection.execute("ALTER TABLE messages ADD COLUMN role_id TEXT")

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

    def create_run(self, thread_id: str, prompt: str, mode: str, role_id: str = "aivra") -> str:
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
            self._connection.execute(
                "INSERT INTO checkpoints(run_id,state_json,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(run_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",
                (run_id, json.dumps(state, ensure_ascii=False), utc_now()),
            )

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
        result = dict(thread)
        result["messages"] = [dict(row) for row in messages]
        result["runs"] = [dict(row) for row in runs]
        result["approvals"] = [dict(row) for row in approvals]
        return result

    def delete_thread(self, thread_id: str) -> bool:
        with self._lock, self._connection:
            exists = self._connection.execute("SELECT 1 FROM threads WHERE id=?", (thread_id,)).fetchone()
            if not exists:
                return False
            self._connection.execute("DELETE FROM approvals WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?)", (thread_id,))
            self._connection.execute("DELETE FROM checkpoints WHERE run_id IN (SELECT id FROM runs WHERE thread_id=?)", (thread_id,))
            self._connection.execute("DELETE FROM token_usage WHERE thread_id=?", (thread_id,))
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
            self._connection.execute("DELETE FROM workspaces WHERE id=?", (workspace_id,))
        return True

    def rename_workspace(self, workspace_id: str, name: str) -> bool:
        with self._lock, self._connection:
            cursor = self._connection.execute("UPDATE workspaces SET name=? WHERE id=?", (name, workspace_id))
        return cursor.rowcount > 0

    def close(self) -> None:
        with self._lock:
            self._connection.close()
