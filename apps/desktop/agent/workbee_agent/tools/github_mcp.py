"""Minimal Streamable HTTP client for GitHub's remote MCP server.

The token is supplied by Electron only in the Agent process environment.  It is
never persisted here or returned in tool output.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List


class GithubMcpError(RuntimeError):
    pass


class RemoteMcpClient:
    protocol_version = "2025-03-26"

    def __init__(self, url: str, token: str = "", name: str = "MCP") -> None:
        self.url = url
        self._token = token
        self.name = name
        self._session_id = ""
        self._next_id = 1

    def _request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        payload = json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}).encode("utf-8")
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": self.protocol_version,
            "User-Agent": "WorkBee/0.1.0",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        request = urllib.request.Request(self.url, payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                self._session_id = response.headers.get("Mcp-Session-Id", self._session_id)
                raw = response.read(2 * 1024 * 1024).decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise GithubMcpError(f"{self.name} MCP 授权已失效，请重新连接") from exc
            raise GithubMcpError(f"{self.name} MCP 请求失败（HTTP {exc.code}）") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise GithubMcpError(f"无法连接 {self.name} MCP，请检查网络后重试") from exc
        event_data = next((line[5:].strip() for line in raw.splitlines() if line.startswith("data:")), "")
        if event_data:
            raw = event_data
        try:
            message = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GithubMcpError("GitHub MCP 返回了无效响应") from exc
        if "error" in message:
            text = str(message["error"].get("message") or "GitHub MCP 工具调用失败") if isinstance(message["error"], dict) else "GitHub MCP 工具调用失败"
            raise GithubMcpError(text[:500])
        result = message.get("result")
        if not isinstance(result, dict):
            raise GithubMcpError("GitHub MCP 未返回结果")
        return result

    def _notify(self, method: str, params: Dict[str, Any]) -> None:
        payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params}).encode("utf-8")
        headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json", "MCP-Protocol-Version": self.protocol_version, "User-Agent": "WorkBee/0.1.0"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        request = urllib.request.Request(self.url, payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30):
                return
        except urllib.error.HTTPError as exc:
            raise GithubMcpError(f"GitHub MCP 初始化失败（HTTP {exc.code}）") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise GithubMcpError(f"无法连接 {self.name} MCP，请检查网络后重试") from exc

    def list_tools(self) -> List[Dict[str, Any]]:
        self._request("initialize", {"protocolVersion": self.protocol_version, "capabilities": {}, "clientInfo": {"name": "WorkBee", "version": "0.1.0"}})
        self._notify("notifications/initialized", {})
        tools = self._request("tools/list", {}).get("tools", [])
        return [item for item in tools if isinstance(item, dict) and isinstance(item.get("name"), str)]

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        result = self._request("tools/call", {"name": name, "arguments": arguments})
        return json.dumps(result, ensure_ascii=False)[:65536]


class GithubMcpClient(RemoteMcpClient):
    def __init__(self, token: str) -> None:
        super().__init__("https://api.githubcopilot.com/mcp/", token, "GitHub")
