from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 1024 * 1024


class ProtocolError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def envelope(
    kind: str,
    message_type: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    request_id: Optional[str] = None,
    run_id: Optional[str] = None,
    sequence: Optional[int] = None,
    error: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    message: Dict[str, Any] = {
        "protocolVersion": PROTOCOL_VERSION,
        "id": str(uuid4()),
        "kind": kind,
        "type": message_type,
        "timestamp": utc_now(),
        "payload": payload or {},
    }
    if request_id is not None:
        message["requestId"] = request_id
    if run_id is not None:
        message["runId"] = run_id
    if sequence is not None:
        message["sequence"] = sequence
    if error is not None:
        message["error"] = error
    return message


def validate_request(message: Any) -> Dict[str, Any]:
    if not isinstance(message, dict):
        raise ProtocolError("INVALID_MESSAGE", "Message must be a JSON object")
    if message.get("protocolVersion") != PROTOCOL_VERSION:
        raise ProtocolError("UNSUPPORTED_PROTOCOL", "Only protocol version 1 is supported")
    if message.get("kind") != "request":
        raise ProtocolError("INVALID_MESSAGE", "Agent accepts request messages only")
    if not isinstance(message.get("id"), str) or not message["id"]:
        raise ProtocolError("INVALID_MESSAGE", "Message id is required")
    if not isinstance(message.get("type"), str) or "." not in message["type"]:
        raise ProtocolError("INVALID_MESSAGE", "Message type is invalid")
    if not isinstance(message.get("payload"), dict):
        raise ProtocolError("INVALID_PAYLOAD", "Payload must be an object")
    return message
