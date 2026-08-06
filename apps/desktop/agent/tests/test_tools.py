from pathlib import Path
import platform
import subprocess

import pytest

from aivra_agent.tools import ToolError, ToolRegistry
from aivra_agent.tools.github_mcp import RemoteMcpClient


def sandbox_available() -> bool:
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


def test_read_file_stays_in_workspace(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "ok.txt").write_text("safe", encoding="utf-8")
    registry = ToolRegistry(workspace)
    assert registry.execute("read_file", {"path": "ok.txt"}) == "safe"
    with pytest.raises(ToolError):
        registry.execute("read_file", {"path": "../outside.txt"})


def test_symlink_escape_is_rejected(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    try:
        (workspace / "escape.txt").symlink_to(outside)
    except OSError as error:
        if getattr(error, "winerror", None) == 1314:
            pytest.skip("Windows symlink creation requires Developer Mode or the Create symbolic links privilege")
        raise
    registry = ToolRegistry(workspace)
    with pytest.raises(ToolError):
        registry.execute("read_file", {"path": "escape.txt"})


def test_side_effect_tools_require_approval(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    registry = ToolRegistry(workspace)
    definitions = {item["function"]["name"] for item in registry.definitions(False)}
    assert "read_file" in definitions
    assert "write_file" not in definitions
    assert registry.describe("write_file").approval_required is True
    assert "run_command" not in definitions
    assert "run_command" in {item["function"]["name"] for item in registry.definitions(True)}
    assert registry.describe("run_command").approval_required is True
    assert registry.describe("write_file").risk == "medium"


def test_generic_remote_mcp_tools_are_namespaced_and_risk_mapped(tmp_path: Path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(RemoteMcpClient, "list_tools", lambda _self: [
        {"name": "search", "description": "Search", "inputSchema": {"type": "object"}, "annotations": {"readOnlyHint": True}},
        {"name": "delete-item", "description": "Delete", "inputSchema": {"type": "object"}, "annotations": {"destructiveHint": True}},
    ])
    monkeypatch.setattr(RemoteMcpClient, "call_tool", lambda _self, name, arguments: f"{name}:{arguments.get('id', '')}")

    registry = ToolRegistry(workspace, mcp_servers=[{
        "id": "notion", "name": "Notion", "url": "https://mcp.example.com", "token": "secret",
    }])

    assert registry.describe("mcp_notion_search").approval_required is False
    assert registry.describe("mcp_notion_delete_item").risk == "high"
    assert registry.describe("mcp_notion_delete_item").approval_required is True
    assert registry.execute("mcp_notion_search", {"id": "123"}) == "search:123"


@pytest.mark.skipif(not sandbox_available(), reason="Seatbelt sandbox-exec is unavailable on this macOS")
def test_command_sandbox_denies_files_outside_workspace(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "inside.txt").write_text("inside", encoding="utf-8")
    outside = tmp_path / "outside.txt"
    outside.write_text("secret", encoding="utf-8")
    registry = ToolRegistry(workspace)
    assert "exit_code=0\ninside" == registry.execute("run_command", {"command": "cat", "arguments": ["inside.txt"]})
    denied = registry.execute("run_command", {"command": "cat", "arguments": [str(outside)]})
    assert "exit_code=1" in denied
    assert "secret" not in denied
