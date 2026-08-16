from workbee_agent.runtime.server import AgentServer


class ProviderRequestError(RuntimeError):
    __module__ = "openai.errors"


def test_network_and_provider_request_errors_use_run_error_banner():
    assert AgentServer._is_request_error(TimeoutError("timed out"))
    assert AgentServer._is_request_error(ProviderRequestError("bad request"))


def test_execution_errors_use_role_message():
    assert not AgentServer._is_request_error(RuntimeError("工具执行步骤超过上限"))


def test_display_only_errors_are_removed_from_model_context():
    messages = [
        {"role": "user", "content": "完成任务", "is_error": False},
        {"role": "assistant", "content": "执行失败", "is_error": True},
        {"role": "user", "content": "换一种方式", "is_error": False},
    ]
    assert [item["content"] for item in AgentServer._context_messages(messages)] == ["完成任务", "换一种方式"]
