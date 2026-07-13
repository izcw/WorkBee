import pytest

from aivra_agent.protocol import ProtocolError, envelope, validate_request


def test_envelope_has_required_fields():
    message = envelope("event", "runtime.ready", {"ok": True})
    assert message["protocolVersion"] == 1
    assert message["payload"] == {"ok": True}
    assert message["timestamp"].endswith("Z")


def test_rejects_wrong_protocol_version():
    with pytest.raises(ProtocolError) as error:
        validate_request({"protocolVersion": 2, "kind": "request", "id": "x", "type": "runtime.hello", "payload": {}})
    assert error.value.code == "UNSUPPORTED_PROTOCOL"
