from workbee_agent.runtime.server import AgentServer


def test_request_mode_asks_for_all_side_effects():
    assert AgentServer._needs_approval("request", "medium", True)
    assert AgentServer._needs_approval("request", "high", True)
    assert not AgentServer._needs_approval("request", "low", False)


def test_auto_mode_only_asks_for_high_risk_side_effects():
    assert not AgentServer._needs_approval("auto", "low", True)
    assert not AgentServer._needs_approval("auto", "medium", True)
    assert AgentServer._needs_approval("auto", "high", True)
    assert AgentServer._needs_approval("auto", "unknown", True)


def test_unknown_mode_fails_closed_for_side_effects():
    assert AgentServer._needs_approval("unexpected", "medium", True)


def test_full_mode_never_asks_for_approval():
    assert not AgentServer._needs_approval("full", "high", True)
