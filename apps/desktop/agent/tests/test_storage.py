from pathlib import Path

from aivra_agent.storage import Database


def test_thread_history_survives_database_reopen(tmp_path: Path):
    db_path = tmp_path / "state.sqlite3"
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(db_path)
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "检查 README")
    run_id = database.create_run(thread_id, "检查 README", "chat")
    database.set_run_role(run_id, "emma")
    database.add_message(thread_id, run_id, "assistant", "完成", "emma")
    database.close()

    reopened = Database(db_path)
    thread = reopened.get_thread(thread_id)
    assert thread is not None
    assert [message["role"] for message in thread["messages"]] == ["user", "assistant"]
    assert thread["messages"][1]["role_id"] == "emma"
    assert thread["runs"][0]["role_id"] == "emma"
    reopened.close()


def test_new_conversation_has_independent_history_in_same_workspace(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "threads.sqlite3")
    workspace = database.select_workspace(workspace_path)
    first_thread = database.create_thread(workspace["id"], "第一段对话")
    first_run = database.create_run(first_thread, "第一段对话", "chat")
    database.add_message(first_thread, first_run, "assistant", "第一段回答", "aivra")

    second_thread = database.create_thread(workspace["id"], "新的独立对话")
    database.create_run(second_thread, "新的独立对话", "chat")

    assert first_thread != second_thread
    assert [item["content"] for item in database.get_thread(second_thread)["messages"]] == ["新的独立对话"]
    assert len(database.list_threads(workspace["id"])) == 2
    database.close()


def test_project_list_and_thread_counts_survive_database_reopen(tmp_path: Path):
    db_path = tmp_path / "projects.sqlite3"
    first_path = tmp_path / "first"
    second_path = tmp_path / "second"
    first_path.mkdir()
    second_path.mkdir()
    database = Database(db_path)
    first = database.select_workspace(first_path, "项目一")
    second = database.select_workspace(second_path, "项目二")
    database.create_thread(first["id"], "第一段对话")
    database.create_thread(first["id"], "第二段对话")
    database.close()

    reopened = Database(db_path)
    projects = {item["id"]: item for item in reopened.list_workspaces()}
    assert projects[first["id"]]["name"] == "项目一"
    assert projects[first["id"]]["thread_count"] == 2
    assert projects[second["id"]]["thread_count"] == 0
    reopened.close()


def test_project_title_can_be_renamed(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "rename.sqlite3")
    workspace = database.select_workspace(workspace_path, "旧标题")

    assert database.rename_workspace(workspace["id"], "新标题") is True
    assert database.list_workspaces()[0]["name"] == "新标题"
    assert database.rename_workspace("missing", "不存在") is False
    database.close()


def test_empty_conversation_is_persisted_and_gets_a_title_on_first_message(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "empty-thread.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "")
    assert database.get_thread(thread_id)["title"] == "新对话"
    database.create_run(thread_id, "分析这个项目的目录结构", "chat")
    assert database.get_thread(thread_id)["title"] == "分析这个项目的目录结构"
    database.close()


def test_deleting_threads_and_projects_removes_only_local_records(tmp_path: Path):
    first_path = tmp_path / "first"
    second_path = tmp_path / "second"
    first_path.mkdir()
    second_path.mkdir()
    database = Database(tmp_path / "delete.sqlite3")
    first = database.select_workspace(first_path)
    second = database.select_workspace(second_path)
    first_thread = database.create_thread(first["id"], "删除我")
    kept_thread = database.create_thread(second["id"], "保留我")

    assert database.delete_thread(first_thread) is True
    assert database.get_thread(first_thread) is None
    another = database.create_thread(first["id"], "随项目删除")
    assert database.delete_workspace(first["id"]) is True
    assert database.get_workspace(first["id"]) is None
    assert database.get_thread(another) is None
    assert database.get_thread(kept_thread) is not None
    assert first_path.exists()  # Removing an Aivra project never deletes the user's folder.
    database.close()


def test_token_usage_is_aggregated_by_model_and_run(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "usage.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "统计 token")
    run_id = database.create_run(thread_id, "统计 token", "task")
    database.record_token_usage(run_id, thread_id, "aivra", "deepseek", "deepseek-v4", 80, 20, 100)
    database.record_token_usage(run_id, thread_id, "aivra", "deepseek", "deepseek-v4", 30, 10, 40)
    database.set_run_status(run_id, "completed")

    summary = database.usage_summary()
    assert summary["totalTokens"] == 140
    assert summary["peakTokens"] == 140
    assert summary["byModel"][0]["input_tokens"] == 110
    assert summary["byModel"][0]["conversations"] == 1
    assert summary["daily"][0]["tokens"] == 140
    database.close()
