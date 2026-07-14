from pathlib import Path
import platform

import pytest

from aivra_agent.tools import ToolError, ToolRegistry


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
    (workspace / "escape.txt").symlink_to(outside)
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


@pytest.mark.skipif(platform.system() != "Darwin", reason="Seatbelt sandbox is macOS-specific")
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
