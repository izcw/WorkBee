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
