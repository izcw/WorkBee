import json

from aivra_agent.runtime.server import AgentServer, select_role_from_output, select_roles_from_output


def test_role_provider_configuration_is_loaded_from_process_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("AIVRA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AIVRA_ROLE_PROVIDERS", json.dumps({
        "aivra": {"name": "BeeYo", "baseUrl": "https://api.example.com/v1", "modelId": "provider-a", "model": "model-a", "apiKey": "test-key"},
        "emma": {"name": "Emma", "baseUrl": "https://other.example.com/v1", "model": "model-b", "apiKey": "other-key"},
    }))
    server = AgentServer()
    assert server.providers["aivra"]["model"] == "model-a"
    assert server.providers["aivra"]["modelId"] == "provider-a"
    assert server.providers["emma"]["baseUrl"] == "https://other.example.com/v1"
    server.shutdown()


def test_role_selector_accepts_json_fences_objects_and_text_names():
    providers = {
        "aivra": {"name": "BeeYo"},
        "nova": {"name": "Nova"},
        "mira": {"name": "Mira"},
        "sage": {"name": "Sage"},
    }
    role_ids = list(providers)
    assert select_role_from_output('```json\n{"roleId":"sage"}\n```', role_ids, providers) == "sage"
    assert select_role_from_output([{"type": "text", "text": '["mira"]'}], role_ids, providers) == "mira"
    assert select_role_from_output("最适合的角色是 Nova。", role_ids, providers) == "nova"
    assert select_role_from_output("无法判断", role_ids, providers) is None


def test_role_selector_context_is_compact_and_keeps_latest_turn():
    from aivra_agent.runtime.server import compact_role_selector_context

    providers = {
        "aivra": {"name": "BeeYo", "description": "general" * 100, "skills": ["general"] * 20},
        "nova": {"name": "Nova", "description": "engineering" * 100, "skills": ["code"] * 20},
    }
    messages = [
        {"role": "user", "content": f"older-{index}" * 300, "role_id": None}
        for index in range(5)
    ] + [{"role": "user", "content": "latest request", "role_id": None}]

    roster, dialogue = compact_role_selector_context(messages, providers, ["aivra", "nova"])

    assert "latest request" in dialogue
    assert "older-0" not in dialogue
    assert len(roster) < 900
    assert len(dialogue) <= 4 * (len("user: ") + 900 + 1)


def test_multi_agent_planner_accepts_ordered_role_lists_and_limits_selection():
    candidates = ["nova", "mira", "sage", "lyra"]
    assert select_roles_from_output(
        '```json\n{"roleIds":["sage","nova","sage","mira","lyra"]}\n```',
        candidates,
        3,
    ) == ["sage", "nova", "mira"]
    assert select_roles_from_output("建议由 nova 与 sage 协作", candidates, 3) == ["nova", "sage"]
    assert select_roles_from_output('{"roleIds":["aivra","unknown"]}', candidates, 3) == []
