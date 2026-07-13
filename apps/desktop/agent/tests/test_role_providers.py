import json

from aivra_agent.runtime.server import AgentServer


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
