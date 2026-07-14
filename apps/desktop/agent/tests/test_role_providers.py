import json

from aivra_agent.runtime.server import AgentServer, select_role_from_output


def test_role_provider_configuration_is_loaded_from_process_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("AIVRA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AIVRA_ROLE_PROVIDERS", json.dumps({
        "aivra": {"name": "Aivra", "baseUrl": "https://api.example.com/v1", "modelId": "provider-a", "model": "model-a", "apiKey": "test-key"},
        "emma": {"name": "Emma", "baseUrl": "https://other.example.com/v1", "model": "model-b", "apiKey": "other-key"},
    }))
    server = AgentServer()
    assert server.providers["aivra"]["model"] == "model-a"
    assert server.providers["aivra"]["modelId"] == "provider-a"
    assert server.providers["emma"]["baseUrl"] == "https://other.example.com/v1"
    server.shutdown()


def test_role_selector_accepts_json_fences_objects_and_text_names():
    providers = {
        "aivra": {"name": "Aivra"},
        "nova": {"name": "Nova"},
        "mira": {"name": "Mira"},
        "sage": {"name": "Sage"},
    }
    role_ids = list(providers)
    assert select_role_from_output('```json\n{"roleId":"sage"}\n```', role_ids, providers) == "sage"
    assert select_role_from_output([{"type": "text", "text": '["mira"]'}], role_ids, providers) == "mira"
    assert select_role_from_output("最适合的角色是 Nova。", role_ids, providers) == "nova"
    assert select_role_from_output("无法判断", role_ids, providers) is None
