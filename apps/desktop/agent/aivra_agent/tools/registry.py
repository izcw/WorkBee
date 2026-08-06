from __future__ import annotations

import functools
import os
import platform
import shutil
import subprocess
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from .github_mcp import GithubMcpClient, GithubMcpError, RemoteMcpClient


class ToolError(RuntimeError):
    pass


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    parameters: Dict[str, Any]
    risk: str
    approval_required: bool
    handler: Callable[[Dict[str, Any]], str]


class ToolRegistry:
    def __init__(self, workspace: Path, github_token: str = "",
                 knowledge_search: Optional[Callable[[str, int], str]] = None,
                 mcp_servers: Optional[List[Dict[str, Any]]] = None) -> None:
        self.workspace = workspace.resolve(strict=True)
        self._tools: Dict[str, ToolDefinition] = {}
        self.github_mcp_error = ""
        self._knowledge_search = knowledge_search
        self._register_defaults()
        if github_token:
            self._register_github_mcp(github_token)
        for server in mcp_servers or []:
            self._register_remote_mcp(server)

    def _safe_existing_path(self, relative: str) -> Path:
        if not relative or Path(relative).is_absolute():
            raise ToolError("Path must be relative to the selected workspace")
        try:
            candidate = (self.workspace / relative).resolve(strict=True)
            candidate.relative_to(self.workspace)
        except (FileNotFoundError, ValueError) as exc:
            raise ToolError("Path does not exist inside the selected workspace") from exc
        return candidate

    def _safe_write_path(self, relative: str) -> Path:
        if not relative or Path(relative).is_absolute():
            raise ToolError("Path must be relative to the selected workspace")
        raw = self.workspace / relative
        try:
            parent = raw.parent.resolve(strict=True)
            parent.relative_to(self.workspace)
        except (FileNotFoundError, ValueError) as exc:
            raise ToolError("Parent directory must exist inside the selected workspace") from exc
        candidate = parent / raw.name
        if candidate.exists():
            try:
                candidate.resolve(strict=True).relative_to(self.workspace)
            except ValueError as exc:
                raise ToolError("Symlink target escapes the selected workspace") from exc
        return candidate

    def _register_defaults(self) -> None:
        self.register("list_files", "列出工作区中的文件。path 为空时列出根目录。", {
            "type": "object", "properties": {"path": {"type": "string", "default": "."}}, "additionalProperties": False
        }, "low", False, self._list_files)
        self.register("read_file", "读取工作区内 UTF-8 文本文件。", {
            "type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"], "additionalProperties": False
        }, "low", False, self._read_file)
        self.register("git_status", "查看工作区 Git 状态，不会修改仓库。", {
            "type": "object", "properties": {}, "additionalProperties": False
        }, "low", False, self._git_status)
        if self._knowledge_search is not None:
            self.register("search_knowledge", "检索当前授权工作区的本地知识索引，返回带文件路径和行号的相关片段。", {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "要检索的问题、概念、符号或错误文本"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12, "default": 6},
                },
                "required": ["query"], "additionalProperties": False,
            }, "low", False, self._search_knowledge)
        self.register("write_file", "创建或覆盖工作区内的 UTF-8 文本文件。是否需要批准由当前审批模式决定。", {
            "type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
            "required": ["path", "content"], "additionalProperties": False
        }, "medium", True, self._write_file)
        self.register("run_command", "在系统沙箱中运行单个命令。禁止网络，写入仅限当前工作区；不支持 Shell 管道或重定向。", {
            "type": "object", "properties": {
                "command": {"type": "string"},
                "arguments": {"type": "array", "items": {"type": "string"}, "default": []},
                "timeout": {"type": "integer", "minimum": 1, "maximum": 120, "default": 30},
            }, "required": ["command"], "additionalProperties": False,
        }, "high", True, self._run_command)

    def _register_github_mcp(self, token: str) -> None:
        """Expose the server's current tool list instead of maintaining a stale copy."""
        client = GithubMcpClient(token)
        try:
            tools = client.list_tools()
        except GithubMcpError as exc:
            self.github_mcp_error = str(exc)
            self.register("github_mcp_status", "检查 GitHub MCP 是否可用，并返回当前注册失败的原因。", {
                "type": "object", "properties": {}, "additionalProperties": False
            }, "low", False, lambda _arguments: f"GitHub MCP 当前不可用：{self.github_mcp_error}")
            return
        for item in tools[:150]:
            remote_name = str(item["name"])
            local_name = "github_" + re.sub(r"[^a-zA-Z0-9_]", "_", remote_name).strip("_")
            if not local_name or local_name in self._tools:
                continue
            schema = item.get("inputSchema")
            parameters = schema if isinstance(schema, dict) else {"type": "object", "properties": {}, "additionalProperties": False}
            annotations = item.get("annotations") if isinstance(item.get("annotations"), dict) else {}
            read_only = annotations.get("readOnlyHint") is True
            destructive = annotations.get("destructiveHint") is True
            risk = "low" if read_only else "high" if destructive else "medium"
            description = str(item.get("description") or remote_name)
            self.register(local_name, f"GitHub MCP：{description}", parameters, risk, not read_only,
                          lambda arguments, remote=remote_name: self._call_github(client, remote, arguments))

    def _register_remote_mcp(self, config: Dict[str, Any]) -> None:
        server_id = re.sub(r"[^a-zA-Z0-9_]", "_", str(config.get("id") or "")).strip("_").lower()
        url = str(config.get("url") or "")
        name = str(config.get("name") or server_id or "Remote")
        if not server_id or not url.startswith(("http://", "https://")):
            return
        client = RemoteMcpClient(url, str(config.get("token") or ""), name)
        try:
            tools = client.list_tools()
        except GithubMcpError as exc:
            self.register(f"mcp_{server_id}_status", f"检查 {name} MCP 连接状态。", {
                "type": "object", "properties": {}, "additionalProperties": False,
            }, "low", False, lambda _arguments, error=str(exc): f"{name} MCP 当前不可用：{error}")
            return
        for item in tools[:150]:
            remote_name = str(item["name"])
            safe_tool = re.sub(r"[^a-zA-Z0-9_]", "_", remote_name).strip("_")
            local_name = f"mcp_{server_id}_{safe_tool}"
            if not safe_tool or local_name in self._tools:
                continue
            schema = item.get("inputSchema")
            parameters = schema if isinstance(schema, dict) else {"type": "object", "properties": {}, "additionalProperties": False}
            annotations = item.get("annotations") if isinstance(item.get("annotations"), dict) else {}
            read_only = annotations.get("readOnlyHint") is True
            destructive = annotations.get("destructiveHint") is True
            risk = "low" if read_only else "high" if destructive else "medium"
            description = str(item.get("description") or remote_name)
            self.register(
                local_name, f"{name} MCP：{description}", parameters, risk, not read_only,
                lambda arguments, remote=remote_name, target=client: self._call_github(target, remote, arguments),
            )

    @staticmethod
    def _call_github(client: GithubMcpClient, name: str, arguments: Dict[str, Any]) -> str:
        try:
            return client.call_tool(name, arguments)
        except GithubMcpError as exc:
            raise ToolError(str(exc)) from exc

    def register(self, name: str, description: str, parameters: Dict[str, Any], risk: str,
                 approval_required: bool, handler: Callable[[Dict[str, Any]], str]) -> None:
        self._tools[name] = ToolDefinition(name, description, parameters, risk, approval_required, handler)

    def definitions(self, allow_side_effects: bool) -> List[Dict[str, Any]]:
        result = []
        for tool in self._tools.values():
            if tool.approval_required and not allow_side_effects:
                continue
            result.append({
                "type": "function",
                "function": {"name": tool.name, "description": tool.description, "parameters": tool.parameters},
            })
        return result

    def describe(self, name: str) -> ToolDefinition:
        if name not in self._tools:
            raise ToolError(f"Unknown tool: {name}")
        return self._tools[name]

    def execute(self, name: str, arguments: Dict[str, Any]) -> str:
        return self.describe(name).handler(arguments)

    def _list_files(self, arguments: Dict[str, Any]) -> str:
        target = self._safe_existing_path(arguments.get("path") or ".")
        if not target.is_dir():
            raise ToolError("Path is not a directory")
        entries: List[str] = []
        for path in sorted(target.rglob("*")):
            try:
                relative = path.relative_to(self.workspace)
            except ValueError:
                continue
            if any(part in {".git", "node_modules", ".venv", "dist", "release"} for part in relative.parts):
                continue
            entries.append(str(relative) + ("/" if path.is_dir() else ""))
            if len(entries) >= 300:
                entries.append("… output truncated at 300 entries")
                break
        return "\n".join(entries) or "(empty directory)"

    def _read_file(self, arguments: Dict[str, Any]) -> str:
        target = self._safe_existing_path(str(arguments.get("path", "")))
        if not target.is_file():
            raise ToolError("Path is not a file")
        if target.stat().st_size > 512 * 1024:
            raise ToolError("File exceeds the 512 KiB read limit")
        try:
            return target.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ToolError("Only UTF-8 text files are supported") from exc

    def _write_file(self, arguments: Dict[str, Any]) -> str:
        content = str(arguments.get("content", ""))
        if len(content.encode("utf-8")) > 1024 * 1024:
            raise ToolError("Content exceeds the 1 MiB write limit")
        target = self._safe_write_path(str(arguments.get("path", "")))
        target.write_text(content, encoding="utf-8")
        return f"Wrote {len(content.encode('utf-8'))} bytes to {target.relative_to(self.workspace)}"

    def _git_status(self, _arguments: Dict[str, Any]) -> str:
        result = subprocess.run(
            ["git", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "status", "--short"],
            cwd=str(self.workspace), capture_output=True, text=True, timeout=20, check=False,
            env={"HOME": str(self.workspace), "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "LANG": "C.UTF-8"},
        )
        output = (result.stdout + result.stderr).strip()
        return output[:65536] or "Working tree clean"

    def _search_knowledge(self, arguments: Dict[str, Any]) -> str:
        if self._knowledge_search is None:
            raise ToolError("Knowledge search is unavailable")
        query = str(arguments.get("query", "")).strip()
        if not query:
            raise ToolError("Knowledge search query is required")
        limit = int(arguments.get("limit", 6))
        return self._knowledge_search(query[:500], max(1, min(limit, 12)))

    @staticmethod
    @functools.lru_cache(maxsize=1)
    def _sandbox_available() -> bool:
        """Whether Seatbelt sandbox-exec can actually apply a profile on this machine."""
        if platform.system() != "Darwin" or not Path("/usr/bin/sandbox-exec").exists():
            return False
        try:
            probe = subprocess.run(
                ["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", "/usr/bin/true"],
                capture_output=True, text=True, timeout=10, check=False,
            )
            return probe.returncode == 0
        except subprocess.TimeoutExpired:
            return False

    def _run_command(self, arguments: Dict[str, Any]) -> str:
        command = str(arguments.get("command", "")).strip()
        args = arguments.get("arguments", [])
        timeout = int(arguments.get("timeout", 30))
        if not command or "/" in command or "\\" in command:
            raise ToolError("Command must be an executable name without a path")
        if not isinstance(args, list) or len(args) > 100 or any(not isinstance(item, str) or len(item) > 4096 for item in args):
            raise ToolError("Command arguments are invalid")
        executable = shutil.which(command)
        if not executable:
            raise ToolError(f"Executable not found: {command}")
        if not self._sandbox_available():
            raise ToolError("A supported OS command sandbox is not available; command execution was refused")
        profile = """
(version 1)
(deny default)
(import "system.sb")
(allow process*)
(allow file-read* (subpath (param "WORKSPACE")))
(allow file-write* (subpath (param "WORKSPACE")))
"""
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"),
            "HOME": str(self.workspace), "TMPDIR": str(self.workspace), "LANG": "C.UTF-8",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
        }
        try:
            result = subprocess.run(
                ["/usr/bin/sandbox-exec", "-D", f"WORKSPACE={self.workspace}", "-p", profile, executable, *args],
                cwd=str(self.workspace), capture_output=True, text=True, timeout=max(1, min(timeout, 120)),
                check=False, env=env,
            )
        except subprocess.TimeoutExpired as exc:
            raise ToolError("Sandboxed command timed out") from exc
        output = (result.stdout + result.stderr).strip()[:65536]
        return f"exit_code={result.returncode}\n{output or '(no output)'}"
