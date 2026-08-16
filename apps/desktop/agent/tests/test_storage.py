from pathlib import Path

from workbee_agent.storage import Database


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


def test_display_only_error_message_is_persisted_with_its_role(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "error-message.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "执行任务")
    run_id = database.create_run(thread_id, "执行任务", "task", "nova")
    database.add_message(thread_id, run_id, "assistant", "处理任务时出现错误", "nova", is_error=True)
    database.set_run_status(run_id, "failed", "内部执行错误")
    database.close()

    reopened = Database(tmp_path / "error-message.sqlite3")
    error_message = reopened.get_thread(thread_id)["messages"][-1]
    assert error_message["role"] == "assistant"
    assert error_message["role_id"] == "nova"
    assert error_message["is_error"] is True
    reopened.close()


def test_run_client_request_id_is_persisted_for_idempotent_retry(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "idempotent-run.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "创建官网")

    run_id = database.create_run(thread_id, "创建官网", "chat", "nova", "client-request-1")
    existing = database.get_run_by_client_request("client-request-1")

    assert existing == {"id": run_id, "thread_id": thread_id, "status": "queued", "role_id": "nova"}
    database.close()


def test_new_conversation_has_independent_history_in_same_workspace(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "threads.sqlite3")
    workspace = database.select_workspace(workspace_path)
    first_thread = database.create_thread(workspace["id"], "第一段对话")
    first_run = database.create_run(first_thread, "第一段对话", "chat")
    database.add_message(first_thread, first_run, "assistant", "第一段回答", "workbee")

    second_thread = database.create_thread(workspace["id"], "新的独立对话")
    database.create_run(second_thread, "新的独立对话", "chat")

    assert first_thread != second_thread
    assert [item["content"] for item in database.get_thread(second_thread)["messages"]] == ["新的独立对话"]
    assert len(database.list_threads(workspace["id"])) == 2
    database.close()


def test_editing_latest_user_message_removes_it_and_all_later_run_data(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "edit-message.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "第一条")
    first_run = database.create_run(thread_id, "第一条", "chat")
    database.add_message(thread_id, first_run, "assistant", "第一条回复", "workbee")
    database.set_run_status(first_run, "completed")
    second_run = database.create_run(thread_id, "第二条", "chat")
    database.add_message(thread_id, second_run, "assistant", "第二条回复", "workbee")
    database.create_approval(second_run, "write_file", {"path": "result.txt"})
    database.save_checkpoint(second_run, {"status": "completed"})
    database.record_token_usage(second_run, thread_id, "workbee", "deepseek", "deepseek-v4", 8, 2, 10)
    database.create_agent_task(second_run, "workbee", "BeeYo", "完成第二条")
    database.set_run_status(second_run, "completed")

    before = database.get_thread(thread_id)
    first_user_id = before["messages"][0]["id"]
    second_user_id = before["messages"][2]["id"]
    assert database.truncate_thread_from_message(thread_id, first_user_id) is None

    truncated = database.truncate_thread_from_message(thread_id, second_user_id)
    assert [message["content"] for message in truncated["messages"]] == ["第一条", "第一条回复"]
    assert [run["id"] for run in truncated["runs"]] == [first_run]
    assert truncated["approvals"] == []
    assert truncated["agent_tasks"] == []
    assert database.get_checkpoint(second_run) is None
    assert database.usage_summary()["totalTokens"] == 0
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
    assert first_path.exists()  # Removing a WorkBee project never deletes the user's folder.
    database.close()


def test_token_usage_is_aggregated_by_model_and_run(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "usage.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "统计 token")
    run_id = database.create_run(thread_id, "统计 token", "task")
    database.record_token_usage(run_id, thread_id, "workbee", "deepseek", "deepseek-v4", 80, 20, 100)
    database.record_token_usage(run_id, thread_id, "workbee", "deepseek", "deepseek-v4", 30, 10, 40)
    database.set_run_status(run_id, "completed")

    summary = database.usage_summary()
    assert summary["totalTokens"] == 140
    assert summary["peakTokens"] == 140
    assert summary["byModel"][0]["input_tokens"] == 110
    assert summary["byModel"][0]["conversations"] == 1
    assert summary["daily"][0]["tokens"] == 140
    database.close()


def test_multi_agent_tasks_are_persisted_with_thread_history(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "agents.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "协作分析")
    run_id = database.create_run(thread_id, "协作分析", "task")
    task_id = database.create_agent_task(run_id, "nova", "Codeo", "检查工程实现")
    database.update_agent_task(task_id, "completed", "结论与证据")

    task = database.get_thread(thread_id)["agent_tasks"][0]
    assert task["role_id"] == "nova"
    assert task["status"] == "completed"
    assert task["output"] == "结论与证据"
    assert database.delete_thread(thread_id) is True
    database.close()


def test_incomplete_run_can_be_recovered_before_side_effects(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "recovery.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "恢复本地任务")
    run_id = database.create_run(thread_id, "恢复本地任务", "task")
    database.save_checkpoint(run_id, {
        "workspaceId": workspace["id"],
        "mode": "task",
        "roleIds": ["workbee", "nova"],
        "approvalMode": "request",
        "documents": ["README.md"],
        "sideEffectsCompleted": False,
    })
    database.set_run_status(run_id, "running")

    assert database.interrupt_incomplete_runs() == 1
    recoverable = database.list_recoverable_runs()
    assert recoverable[0]["id"] == run_id
    assert recoverable[0]["safeToResume"] is True

    resumed = database.prepare_run_resume(run_id)
    assert resumed is not None
    assert resumed["thread_id"] == thread_id
    assert resumed["roleIds"] == ["workbee", "nova"]
    assert database.prepare_run_resume(run_id) is None
    database.close()


def test_run_is_not_replayed_after_side_effect_completed(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "unsafe-recovery.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "执行写入")
    run_id = database.create_run(thread_id, "执行写入", "task")
    database.save_checkpoint(run_id, {
        "workspaceId": workspace["id"],
        "mode": "task",
        "roleIds": ["workbee"],
        "sideEffectsCompleted": True,
    })
    database.set_run_status(run_id, "waiting_approval")

    assert database.interrupt_incomplete_runs() == 1
    recoverable = database.list_recoverable_runs()
    assert recoverable[0]["safeToResume"] is False
    assert database.prepare_run_resume(run_id) is None
    database.close()


def test_run_is_not_replayed_when_side_effect_outcome_is_unknown(tmp_path: Path):
    workspace_path = tmp_path / "workspace"
    workspace_path.mkdir()
    database = Database(tmp_path / "unknown-side-effect.sqlite3")
    workspace = database.select_workspace(workspace_path)
    thread_id = database.create_thread(workspace["id"], "执行外部操作")
    run_id = database.create_run(thread_id, "执行外部操作", "task")
    database.save_checkpoint(run_id, {
        "workspaceId": workspace["id"],
        "mode": "task",
        "roleIds": ["workbee"],
        "sideEffectStarted": True,
        "sideEffectsCompleted": False,
    })
    database.set_run_status(run_id, "running")

    database.interrupt_incomplete_runs()

    assert database.list_recoverable_runs()[0]["safeToResume"] is False
    assert database.prepare_run_resume(run_id) is None
    database.close()
