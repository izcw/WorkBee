import threading
import time

import pytest

from workbee_agent.graphs import RunCancelled
from workbee_agent.runtime import server as server_module
from workbee_agent.runtime.server import AgentServer


def test_fast_selection_waits_until_two_seconds(monkeypatch):
    waited = []

    class CapturingCancel:
        def wait(self, seconds):
            waited.append(seconds)
            return False

    monkeypatch.setattr(server_module.time, "monotonic", lambda: 10.5)
    AgentServer._wait_for_minimum_selection_time(10.0, CapturingCancel())
    assert waited == [1.5]


def test_completed_selection_only_waits_for_remaining_minimum_time():
    started_at = time.monotonic() - 2.1
    before = time.monotonic()
    AgentServer._wait_for_minimum_selection_time(started_at, threading.Event())
    assert time.monotonic() - before < 0.1


def test_minimum_selection_wait_can_be_cancelled_immediately():
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(RunCancelled):
        AgentServer._wait_for_minimum_selection_time(time.monotonic(), cancel)
