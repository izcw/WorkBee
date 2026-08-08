from __future__ import annotations

import json
import os
import re
import sys
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from .. import __version__
from ..graphs import RunCancelled, SingleAgentGraph
from ..knowledge import EmbeddingProvider, KnowledgeRepository
from ..protocol import MAX_LINE_BYTES, ProtocolError, envelope, validate_request
from ..storage import Database
from ..tools import ToolError, ToolRegistry

BUILTIN_KNOWLEDGE = {
    "aivra-working-principles": (
        "通用工作准则：先澄清目标、交付物、约束与风险；再检查现有项目和可用资料；"
        "将任务拆成可验证步骤，执行后用文件内容、测试或命令结果复核，不虚构已完成的操作。"
    ),
    "software-delivery-baseline": (
        "软件交付基线：尊重项目既有架构和用户改动；实现前阅读相关代码，修改保持最小且完整；"
        "按风险运行测试、类型检查或构建，明确未验证项，不执行未经授权的破坏性操作。"
    ),
    "product-design-guidelines": (
        "产品与设计规范：从用户目标、关键流程和异常状态出发，保持信息层级、交互反馈和视觉语言一致；"
        "输出可实现的结构、状态、文案与验收标准，并兼顾可访问性和不同窗口尺寸。"
    ),
}


def configure_standard_streams() -> None:
    """Use UTF-8 for the JSON Lines protocol regardless of the Windows code page."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="strict")


def select_role_from_output(content: Any, role_ids: List[str], providers: Dict[str, Dict[str, Any]]) -> Optional[str]:
    """Accept common structured/text model outputs without silently defaulting to the first role."""
    texts: List[str] = []

    def collect(value: Any) -> None:
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, dict):
            for key in ("roleId", "role_id", "id", "text", "content"):
                if key in value:
                    collect(value[key])
        elif isinstance(value, list):
            for item in value:
                collect(item)

    collect(content)
    for text in list(texts):
        stripped = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text, flags=re.IGNORECASE)
        candidates = [stripped]
        for pattern in (r"\{[\s\S]*?\}", r"\[[\s\S]*?\]"):
            candidates.extend(re.findall(pattern, stripped))
        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except (json.JSONDecodeError, TypeError):
                continue
            parsed_texts: List[str] = []
            before = len(texts)
            collect(parsed)
            parsed_texts.extend(texts[before:])
            for value in parsed_texts:
                if value in role_ids:
                    return value

    searchable = "\n".join(texts)
    mentions: List[tuple[int, str]] = []
    for role_id in role_ids:
        provider_name = str(providers.get(role_id, {}).get("name") or "")
        for label in (role_id, provider_name):
            if not label:
                continue
            match = re.search(rf"(?<![\w-]){re.escape(label)}(?![\w-])", searchable, flags=re.IGNORECASE)
            if match:
                mentions.append((match.start(), role_id))
    return min(mentions)[1] if mentions else None


def select_roles_from_output(content: Any, role_ids: List[str], limit: int = 3) -> List[str]:
    """Extract an ordered role list from a planner response."""
    texts: List[str] = []
    if isinstance(content, str):
        texts.append(content)
    elif isinstance(content, list):
        texts.extend(str(item.get("text") or item.get("content") or "") if isinstance(item, dict) else str(item) for item in content)
    elif isinstance(content, dict):
        texts.append(json.dumps(content, ensure_ascii=False))
    selected: List[str] = []
    for text in texts:
        stripped = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text, flags=re.IGNORECASE)
        candidates = [stripped, *re.findall(r"\{[\s\S]*?\}|\[[\s\S]*?\]", stripped)]
        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except (json.JSONDecodeError, TypeError):
                continue
            values = parsed.get("roleIds", parsed.get("roles", [])) if isinstance(parsed, dict) else parsed
            if isinstance(values, str):
                values = [values]
            if isinstance(values, list):
                for value in values:
                    role_id = str(value)
                    if role_id in role_ids and role_id not in selected:
                        selected.append(role_id)
                        if len(selected) >= limit:
                            return selected
    searchable = "\n".join(texts)
    positions = []
    for role_id in role_ids:
        match = re.search(rf"(?<![\w-]){re.escape(role_id)}(?![\w-])", searchable, flags=re.IGNORECASE)
        if match:
            positions.append((match.start(), role_id))
    return [item[1] for item in sorted(positions)[:limit]]


def compact_role_selector_context(thread_messages: List[Dict[str, Any]], providers: Dict[str, Dict[str, Any]],
                                  role_ids: List[str]) -> tuple[str, str]:
    """Keep routing lightweight: it is a classifier, not another full agent turn."""
    roster = "\n".join(
        " | ".join(filter(None, (
            item,
            str(providers[item].get("name") or item)[:60],
            str(providers[item].get("description") or "")[:180],
            ", ".join(providers[item].get("skills", [])[:8])[:160],
        )))
        for item in role_ids
    )

    def speaker(message: Dict[str, Any]) -> str:
        if message["role"] == "user":
            return "user"
        return str(providers.get(message.get("role_id"), {}).get("name") or "assistant")[:40]

    # The current user prompt is always the last message.  A few preceding turns
    # preserve references such as "that file" without making selection expensive.
    dialogue = "\n".join(
        f"{speaker(item)}: {str(item['content'])[:900]}" for item in thread_messages[-4:]
    )
    return roster, dialogue


@dataclass
class PendingApproval:
    run_id: str
    decision: threading.Event = field(default_factory=threading.Event)
    approved: bool = False


class AgentServer:
    def __init__(self) -> None:
        data_dir = Path(os.environ.get("AIVRA_DATA_DIR", str(Path.home() / ".aivra")))
        self.database = Database(data_dir / "aivra.sqlite3")
        self.database.interrupt_incomplete_runs()
        self.api_key = os.environ.get("AIVRA_DEEPSEEK_API_KEY", "")
        self.model = os.environ.get("AIVRA_MODEL", "deepseek-v4-flash")
        self.base_url = os.environ.get("AIVRA_BASE_URL", "https://api.deepseek.com")
        self.providers = self._load_providers()
        self.github_mcp_token = os.environ.get("AIVRA_GITHUB_MCP_TOKEN", "")
        self.mcp_servers = self._load_mcp_servers()
        self.embedding_provider = EmbeddingProvider.from_environment(os.environ.get("AIVRA_EMBEDDING_PROVIDER", ""))
        self.max_tool_steps = self._int_env("AIVRA_MAX_TOOL_STEPS", 12, 4, 100)
        self._write_lock = threading.Lock()
        self._shutdown = threading.Event()
        self._runs: Dict[str, threading.Event] = {}
        self._workers: Dict[str, threading.Thread] = {}
        self._approvals: Dict[str, PendingApproval] = {}
        self._state_lock = threading.RLock()
        self._indexing_workspaces: set[str] = set()

    @staticmethod
    def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
        try:
            return max(minimum, min(int(os.environ.get(name, "") or default), maximum))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _load_mcp_servers() -> List[Dict[str, Any]]:
        try:
            value = json.loads(os.environ.get("AIVRA_MCP_SERVERS", "[]"))
            if not isinstance(value, list):
                return []
            return [
                item for item in value[:20]
                if isinstance(item, dict) and isinstance(item.get("id"), str) and isinstance(item.get("url"), str)
            ]
        except (json.JSONDecodeError, TypeError):
            return []

    def _load_providers(self) -> Dict[str, Dict[str, Any]]:
        fallback = {"aivra": {"name": "BeeYo", "description": "默认 Agent", "skills": [], "knowledge": [], "apiKey": self.api_key, "modelId": self.model, "model": self.model, "baseUrl": self.base_url}}
        try:
            value = json.loads(os.environ.get("AIVRA_ROLE_PROVIDERS", ""))
            if not isinstance(value, dict):
                return fallback
            providers: Dict[str, Dict[str, Any]] = {}
            for role_id, provider in value.items():
                if not isinstance(role_id, str) or not isinstance(provider, dict):
                    continue
                providers[role_id] = {
                    "name": str(provider.get("name") or role_id), "apiKey": str(provider.get("apiKey") or ""),
                    "description": str(provider.get("description") or ""),
                    "skills": [str(item) for item in provider.get("skills", []) if isinstance(item, str)][:30],
                    "knowledge": [str(item) for item in provider.get("knowledge", []) if isinstance(item, str)][:30],
                    "modelId": str(provider.get("modelId") or provider.get("model") or role_id),
                    "model": str(provider.get("model") or self.model), "baseUrl": str(provider.get("baseUrl") or self.base_url),
                }
            return providers or fallback
        except (json.JSONDecodeError, TypeError):
            return fallback

    def send(self, message: Dict[str, Any]) -> None:
        encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        with self._write_lock:
            sys.stdout.write(encoded + "\n")
            sys.stdout.flush()

    def respond(self, request: Dict[str, Any], message_type: str, payload: Dict[str, Any],
                error: Optional[Dict[str, Any]] = None) -> None:
        self.send(envelope("response", message_type, payload, request_id=request["id"], error=error))

    def event(self, message_type: str, payload: Dict[str, Any], run_id: Optional[str] = None,
              sequence: Optional[int] = None) -> None:
        self.send(envelope("event", message_type, payload, run_id=run_id, sequence=sequence))

    def serve(self) -> None:
        for raw_line in sys.stdin.buffer:
            if self._shutdown.is_set():
                break
            if len(raw_line) > MAX_LINE_BYTES:
                self.send(envelope("event", "runtime.error", {}, error={
                    "code": "MESSAGE_TOO_LARGE", "message": "Protocol line exceeds 1 MiB", "retryable": False
                }))
                continue
            try:
                request = validate_request(json.loads(raw_line.decode("utf-8")))
                should_stop = self.handle(request)
                if should_stop:
                    break
            except json.JSONDecodeError:
                self.send(envelope("event", "runtime.error", {}, error={
                    "code": "INVALID_JSON", "message": "Invalid JSON line", "retryable": False
                }))
            except ProtocolError as exc:
                self.send(envelope("event", "runtime.error", {}, error={
                    "code": exc.code, "message": exc.message, "retryable": False
                }))
            except Exception as exc:  # request boundary
                print(f"request failure: {type(exc).__name__}: {exc}", file=sys.stderr)
                if "request" in locals():
                    self.respond(request, request.get("type", "runtime.error"), {}, {
                        "code": "INTERNAL_ERROR", "message": "Agent request failed", "retryable": False
                    })
        self.shutdown()

    def handle(self, request: Dict[str, Any]) -> bool:
        message_type = request["type"]
        payload = request["payload"]
        if message_type == "runtime.hello":
            self.respond(request, "runtime.ready", {
                "agentVersion": __version__, "protocolVersion": 1,
                "capabilities": [
                    "workspace", "chat", "tools", "approval", "cancel", "persistence",
                    "multi_agent", "knowledge_retrieval", "hybrid_retrieval", "mcp_registry",
                ],
                "provider": {"roles": [{"id": role_id, "name": value["name"], "model": value["model"], "baseUrl": value["baseUrl"], "keyAvailable": bool(value["apiKey"])} for role_id, value in self.providers.items()]},
            })
        elif message_type == "runtime.health":
            self.respond(request, "runtime.health", {"status": "ready", "activeRuns": len(self._runs)})
        elif message_type == "runtime.shutdown":
            self.respond(request, "runtime.shutdown", {"accepted": True})
            return True
        elif message_type == "workspace.select":
            workspace = self.database.select_workspace(Path(self._required_string(payload, "path")), str(payload.get("name") or "").strip()[:80] or None)
            self._schedule_lexical_index(workspace)
            self.respond(request, "workspace.selected", {"workspace": workspace})
        elif message_type == "workspace.tree":
            workspace = self.database.get_workspace(self._required_string(payload, "workspaceId"))
            if workspace is None:
                self.respond(request, "workspace.tree", {}, {"code": "WORKSPACE_NOT_FOUND", "message": "Workspace not found", "retryable": False})
            else:
                self.respond(request, "workspace.tree", {"tree": self._workspace_tree(Path(workspace["path"]))})
        elif message_type == "workspace.list":
            self.respond(request, "workspace.list", {"workspaces": self.database.list_workspaces()})
        elif message_type == "workspace.delete":
            workspace_id = self._required_string(payload, "workspaceId")
            self.respond(request, "workspace.delete", {"workspaceId": workspace_id, "deleted": self.database.delete_workspace(workspace_id)})
        elif message_type == "workspace.rename":
            workspace_id = self._required_string(payload, "workspaceId")
            name = self._required_string(payload, "name").strip()[:80]
            self.respond(request, "workspace.rename", {"workspaceId": workspace_id, "name": name, "updated": self.database.rename_workspace(workspace_id, name)})
        elif message_type == "usage.summary":
            self.respond(request, "usage.summary", {"usage": self.database.usage_summary()})
        elif message_type == "thread.list":
            workspace_id = payload.get("workspaceId")
            self.respond(request, "thread.list", {"threads": self.database.list_threads(workspace_id)})
        elif message_type == "thread.create":
            workspace_id = self._required_string(payload, "workspaceId")
            if self.database.get_workspace(workspace_id) is None:
                self.respond(request, "thread.create", {}, {"code": "WORKSPACE_NOT_FOUND", "message": "Workspace not found", "retryable": False})
            else:
                self.respond(request, "thread.create", {"threadId": self.database.create_thread(workspace_id, "")})
        elif message_type == "thread.delete":
            thread_id = self._required_string(payload, "threadId")
            self.respond(request, "thread.delete", {"threadId": thread_id, "deleted": self.database.delete_thread(thread_id)})
        elif message_type == "thread.get":
            thread = self.database.get_thread(self._required_string(payload, "threadId"))
            if thread is None:
                self.respond(request, "thread.get", {}, {"code": "THREAD_NOT_FOUND", "message": "Thread not found", "retryable": False})
            else:
                self.respond(request, "thread.get", {"thread": thread})
        elif message_type == "run.create":
            self._create_run(request, payload)
        elif message_type == "run.recoverable":
            self.respond(request, "run.recoverable", {"runs": self.database.list_recoverable_runs()})
        elif message_type == "run.resume":
            self._resume_run(request, payload)
        elif message_type == "run.cancel":
            run_id = self._required_string(payload, "runId")
            with self._state_lock:
                cancel = self._runs.get(run_id)
            if cancel:
                cancel.set()
            self.respond(request, "run.cancel", {"runId": run_id, "accepted": bool(cancel)})
        elif message_type == "approval.resolve":
            self._resolve_approval(request, payload)
        else:
            self.respond(request, message_type, {}, {
                "code": "UNKNOWN_MESSAGE_TYPE", "message": f"Unsupported message type: {message_type}", "retryable": False
            })
        return False

    @staticmethod
    def _required_string(payload: Dict[str, Any], key: str) -> str:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ProtocolError("INVALID_PAYLOAD", f"{key} must be a non-empty string")
        return value

    def _create_run(self, request: Dict[str, Any], payload: Dict[str, Any]) -> None:
        workspace_id = self._required_string(payload, "workspaceId")
        prompt = self._required_string(payload, "prompt")
        mode = payload.get("mode", "task")
        role_ids = payload.get("roleIds", [payload.get("roleId", "aivra")])
        approval_mode = payload.get("approvalMode", "request")
        workflow_name = str(payload.get("workflowName") or "")[:80]
        documents = payload.get("documents", [])
        if mode not in {"chat", "task"}:
            raise ProtocolError("INVALID_PAYLOAD", "mode must be chat or task")
        if not isinstance(role_ids, list) or not role_ids or len(role_ids) > 20 or any(not isinstance(role_id, str) or role_id not in self.providers for role_id in role_ids):
            raise ProtocolError("INVALID_PAYLOAD", "roleIds contain an unconfigured role")
        role_ids = list(dict.fromkeys(role_ids))
        if approval_mode not in {"request", "auto", "full"}:
            raise ProtocolError("INVALID_PAYLOAD", "approvalMode is invalid")
        if not isinstance(documents, list) or len(documents) > 100 or any(not isinstance(item, str) or not item.strip() for item in documents):
            raise ProtocolError("INVALID_PAYLOAD", "documents must be relative workspace paths")
        role_id = role_ids[0]
        workspace = self.database.get_workspace(workspace_id)
        if workspace is None:
            self.respond(request, "run.created", {}, {"code": "WORKSPACE_NOT_FOUND", "message": "Select a workspace first", "retryable": False})
            return
        thread_id = payload.get("threadId")
        if not isinstance(thread_id, str) or not thread_id:
            thread_id = self.database.create_thread(workspace_id, prompt)
        else:
            existing_thread = self.database.get_thread(thread_id)
            if existing_thread is None:
                self.respond(request, "run.created", {}, {"code": "THREAD_NOT_FOUND", "message": "Thread not found", "retryable": False})
                return
            if existing_thread["workspace_id"] != workspace_id:
                self.respond(request, "run.created", {}, {"code": "THREAD_WORKSPACE_MISMATCH", "message": "Thread does not belong to the selected workspace", "retryable": False})
                return
        run_id = self.database.create_run(thread_id, prompt, mode, role_id)
        self.database.save_checkpoint(run_id, {
            "status": "queued", "workspaceId": workspace_id, "mode": mode, "roleIds": role_ids,
            "approvalMode": approval_mode, "workflowName": workflow_name, "documents": documents,
            "sideEffectsCompleted": False,
        })
        cancel = threading.Event()
        with self._state_lock:
            self._runs[run_id] = cancel
        self.respond(request, "run.created", {"runId": run_id, "threadId": thread_id, "roleIds": role_ids})
        worker = threading.Thread(
            target=self._execute_run,
            args=(run_id, thread_id, workspace, mode, role_ids, approval_mode, workflow_name, documents, cancel),
            name=f"aivra-run-{run_id[:8]}", daemon=True,
        )
        with self._state_lock:
            self._workers[run_id] = worker
        worker.start()

    def _resume_run(self, request: Dict[str, Any], payload: Dict[str, Any]) -> None:
        run_id = self._required_string(payload, "runId")
        recovered = self.database.prepare_run_resume(run_id)
        if recovered is None:
            self.respond(request, "run.resume", {}, {
                "code": "RUN_NOT_RECOVERABLE",
                "message": "任务不存在、已恢复，或此前可能已产生副作用，不能安全重放",
                "retryable": False,
            })
            return
        workspace = self.database.get_workspace(str(recovered["workspace_id"]))
        if workspace is None:
            self.respond(request, "run.resume", {}, {
                "code": "WORKSPACE_NOT_FOUND", "message": "原工作区不存在", "retryable": False,
            })
            return
        role_ids = [item for item in recovered.get("roleIds", []) if item in self.providers]
        if not role_ids:
            role_ids = [str(recovered.get("role_id") or "aivra")]
        cancel = threading.Event()
        with self._state_lock:
            self._runs[run_id] = cancel
        self.respond(request, "run.resume", {
            "runId": run_id, "threadId": recovered["thread_id"], "roleIds": role_ids,
        })
        worker = threading.Thread(
            target=self._execute_run,
            args=(
                run_id, recovered["thread_id"], workspace, str(recovered.get("mode") or "task"), role_ids,
                str(recovered.get("approvalMode") or "request"), str(recovered.get("workflowName") or ""),
                list(recovered.get("documents") or []), cancel,
            ),
            name=f"aivra-resume-{run_id[:8]}", daemon=True,
        )
        with self._state_lock:
            self._workers[run_id] = worker
        worker.start()

    def _resolve_approval(self, request: Dict[str, Any], payload: Dict[str, Any]) -> None:
        approval_id = self._required_string(payload, "approvalId")
        approved = payload.get("approved")
        if not isinstance(approved, bool):
            raise ProtocolError("INVALID_PAYLOAD", "approved must be boolean")
        with self._state_lock:
            pending = self._approvals.get(approval_id)
        if pending:
            pending.approved = approved
            self.database.resolve_approval(approval_id, approved)
            pending.decision.set()
        self.respond(request, "approval.resolve", {"approvalId": approval_id, "accepted": bool(pending)})

    def _execute_run(self, run_id: str, thread_id: str, workspace: Dict[str, Any], mode: str, role_ids: List[str],
                     approval_mode: str, workflow_name: str, documents: List[str], cancel: threading.Event) -> None:
        sequence = 0
        emit_lock = threading.Lock()

        def emit(message_type: str, payload: Dict[str, Any]) -> None:
            nonlocal sequence
            with emit_lock:
                sequence += 1
                self.event(message_type, payload, run_id, sequence)

        try:
            team_task = mode == "task" and len(role_ids) > 1
            role_id = "aivra" if team_task and "aivra" in role_ids else role_ids[0]
            provider = self.providers[role_id]
            if not provider["apiKey"]:
                raise RuntimeError(f"请先为协调角色 {provider['name']} 配置 API Key")
            self.database.set_run_status(run_id, "running")
            emit("run.started", {"runId": run_id, "threadId": thread_id, "roleIds": role_ids})
            thread = self.database.get_thread(thread_id)
            assert thread is not None
            knowledge = KnowledgeRepository(
                self.database, workspace["id"], Path(workspace["path"]), self.embedding_provider
            )
            workspace_documents = [
                item for item in documents
                if item not in BUILTIN_KNOWLEDGE and not Path(item).is_absolute() and ".." not in Path(item).parts
            ]
            index_stats = knowledge.index(workspace_documents)
            emit("knowledge.indexed", {
                "workspaceId": workspace["id"], "retrievalMode": "hybrid" if self.embedding_provider else "fts5",
                **index_stats,
            })

            if len(role_ids) > 1 and not team_task:
                emit("team.selecting", {"roleIds": role_ids, "names": [self.providers[item]["name"] for item in role_ids]})
                router_role_id = role_id
                router_provider = provider
                selector_graph = SingleAgentGraph(
                    api_key=router_provider["apiKey"], base_url=router_provider["baseUrl"], model=router_provider["model"], tools=[],
                    on_delta=lambda _delta: None, cancel_event=cancel, streaming=False,
                    temperature=0, timeout=20, max_retries=0, max_tokens=24,
                )
                roster_order = [item for item in role_ids if item != "aivra"] + [item for item in role_ids if item == "aivra"]
                roster, recent_dialogue = compact_role_selector_context(thread["messages"], self.providers, roster_order)
                selector_response = selector_graph.invoke([
                    SystemMessage(content=(
                        "你是群聊角色路由器。根据候选角色的职责、用户最新问题以及带说话人姓名的历史对话，"
                        "选择最适合直接回答本轮问题的一个角色。不要因为某角色刚刚回答过就默认继续选择它；"
                        "应以本轮问题与职责的匹配度为准。候选顺序不代表优先级；当工程、产品设计、研究文档等专业角色"
                        "与任务直接匹配时优先选择专业角色，只有任务确实需要跨领域统筹或没有专业角色匹配时才选择统筹角色。"
                        "只输出一个 JSON 对象，格式为 {\"roleId\":\"候选角色 id\"}，不要输出解释。"
                    )),
                    HumanMessage(content=f"候选角色：\n{roster}\n\n当前对话：\n{recent_dialogue}"),
                ])
                self._record_usage(run_id, thread_id, router_role_id, router_provider, selector_response)
                answer_role_id = select_role_from_output(selector_response.content, role_ids, self.providers)
                if answer_role_id is None:
                    raise RuntimeError("智能角色选择未返回有效角色，请重试")
                role_ids = [answer_role_id]
                role_id = answer_role_id
                provider = self.providers[role_id]
                self.database.set_run_role(run_id, role_id)
                emit("team.selected", {"roleIds": role_ids, "names": [provider["name"]], "answerRoleId": role_id})
            elif team_task:
                candidates = [
                    item for item in role_ids if item != role_id and self.providers[item]["apiKey"]
                ]
                emit("team.selecting", {
                    "roleIds": role_ids,
                    "names": [self.providers[item]["name"] for item in role_ids],
                    "mode": "collaboration",
                })
                selected_specialists: List[str] = []
                if candidates:
                    roster, recent_dialogue = compact_role_selector_context(
                        thread["messages"], self.providers, candidates
                    )
                    planner_graph = SingleAgentGraph(
                        api_key=provider["apiKey"], base_url=provider["baseUrl"], model=provider["model"], tools=[],
                        on_delta=lambda _delta: None, cancel_event=cancel, streaming=False,
                        temperature=0, timeout=25, max_retries=0, max_tokens=96,
                    )
                    planner_response = planner_graph.invoke([
                        SystemMessage(content=(
                            "你是多智能体任务协调器。根据任务与候选角色职责，选择 1 到 3 个能提供互补价值的专家。"
                            "只输出 JSON：{\"roleIds\":[\"角色id\"]}。不要选择协调者，不要解释。"
                        )),
                        HumanMessage(content=f"候选专家：\n{roster}\n\n任务上下文：\n{recent_dialogue}"),
                    ])
                    self._record_usage(run_id, thread_id, role_id, provider, planner_response)
                    selected_specialists = select_roles_from_output(planner_response.content, candidates, 3)
                    if not selected_specialists:
                        selected_specialists = candidates[:min(2, len(candidates))]
                role_ids = [role_id, *selected_specialists]
                self.database.set_run_role(run_id, role_id)
                emit("team.selected", {
                    "roleIds": role_ids,
                    "names": [self.providers[item]["name"] for item in role_ids],
                    "answerRoleId": role_id,
                    "mode": "collaboration",
                })

            registry = ToolRegistry(
                Path(workspace["path"]), self.github_mcp_token, knowledge.format_results, self.mcp_servers
            )
            team_names = "、".join(self.providers[item]["name"] for item in role_ids)
            knowledge_refs = provider.get("knowledge", [])
            knowledge_guidance = "\n".join(BUILTIN_KNOWLEDGE.get(item, f"知识库引用：{item}") for item in knowledge_refs)
            system = (
                f"你是 {provider['name']}。角色描述：{provider.get('description', '')}。已启用技能：{'、'.join(provider.get('skills', [])) or '通用能力'}。"
                f"内置知识与引用：{knowledge_guidance or '无'}。"
                f"当前参与任务的 WorkBee 团队成员为：{team_names}。用中文简洁回答。"
                f"当前且唯一授权工作区是 {workspace['name']}。不得访问或操作该文件夹之外的任何路径。读取上下文时主动使用工具。"
                "不得声称执行过未调用的工具。你可以使用系统实际提供的读写与命令工具；是否需要用户批准由运行时按当前审批模式和风险等级决定，不要自行要求用户用文字确认。"
                "命令工具不经过 Shell，网络被禁用，写入仅限当前工作区。"
            )
            if self.github_mcp_token:
                system += "已连接 GitHub MCP。名称以 github_ 开头的工具会访问 GitHub；优先使用只读工具，涉及创建、修改或删除 GitHub 资源时必须等待运行时审批。若用户使用 @github，优先调用 GitHub MCP 工具完成请求。"
                if registry.github_mcp_error:
                    system += f"GitHub MCP 工具发现失败：{registry.github_mcp_error}。不要声称 GitHub 工具可用；可调用 github_mcp_status 获取状态。"
            if self.mcp_servers:
                system += "已加载通用远程 MCP Server 注册表；名称以 mcp_ 开头的工具按 Server 和 Tool 命名空间隔离，副作用调用仍由运行时审批。"
            if workflow_name:
                system += f"当前流程为“{workflow_name}”。"
            if documents:
                knowledge_documents = [item for item in documents if item in BUILTIN_KNOWLEDGE]
                if knowledge_documents:
                    system += "当前流程引用的知识库内容：" + "\n".join(BUILTIN_KNOWLEDGE[item] for item in knowledge_documents)
                if workspace_documents:
                    system += "本流程引用的工作区文档为：" + "、".join(workspace_documents) + "。需要内容时使用读取工具，不能假装已读。"
            latest_prompt = str(thread["messages"][-1]["content"]) if thread["messages"] else ""
            retrieved_context = knowledge.format_results(latest_prompt, 6)
            if not retrieved_context.startswith("未在当前工作区"):
                system += (
                    "以下是根据用户当前问题自动检索的本地知识片段。它们只是证据候选，"
                    "回答前应核验相关性，并在使用时保留来源路径与行号：\n" + retrieved_context
                )
            system += (
                "需要跨文件定位事实、概念、符号或历史约定时，优先调用 search_knowledge；"
                "引用检索结果时保留其文件路径和行号，检索不到依据时明确说明。"
            )
            messages: List[Any] = [SystemMessage(content=system)]
            for item in thread["messages"]:
                if item["role"] == "user":
                    messages.append(HumanMessage(content=item["content"]))
                elif item["role"] == "assistant":
                    messages.append(AIMessage(content=item["content"]))
            advice_items: List[str] = []
            specialist_ids = role_ids[1:] if team_task else []
            if specialist_ids:
                with ThreadPoolExecutor(max_workers=min(3, len(specialist_ids)), thread_name_prefix="aivra-specialist") as executor:
                    futures = {}
                    for collaborator_id in specialist_ids:
                        collaborator = self.providers[collaborator_id]
                        task_id = self.database.create_agent_task(
                            run_id, collaborator_id, collaborator["name"],
                            str(thread["messages"][-1]["content"])[:4000],
                        )
                        self.database.update_agent_task(task_id, "running")
                        emit("agent.started", {
                            "taskId": task_id, "roleId": collaborator_id,
                            "name": collaborator["name"], "model": collaborator["model"],
                        })
                        future = executor.submit(
                            self._run_specialist, run_id, thread_id, collaborator_id, collaborator,
                            messages[1:], Path(workspace["path"]), knowledge, cancel,
                        )
                        futures[future] = (task_id, collaborator_id, collaborator)
                    for future in as_completed(futures):
                        task_id, collaborator_id, collaborator = futures[future]
                        if cancel.is_set():
                            raise RunCancelled("Run was cancelled")
                        try:
                            advice = future.result()
                            self.database.update_agent_task(task_id, "completed", advice)
                            advice_items.append(f"{collaborator['name']} 的专业分析：\n{advice}")
                            emit("agent.completed", {
                                "taskId": task_id, "roleId": collaborator_id,
                                "name": collaborator["name"],
                            })
                        except RunCancelled:
                            self.database.update_agent_task(task_id, "cancelled")
                            raise
                        except Exception as exc:
                            safe_error = str(exc)[:1000]
                            self.database.update_agent_task(task_id, "failed", error=safe_error)
                            emit("agent.failed", {
                                "taskId": task_id, "roleId": collaborator_id,
                                "name": collaborator["name"], "message": safe_error,
                            })
            if advice_items:
                messages.insert(1, SystemMessage(content=(
                    "以下是只读专家 Agent 基于工作区与知识检索得到的独立分析。"
                    "你是最终协调者，必须核验其结论；需要修改或运行命令时由你统一调用工具并遵守审批。\n\n"
                    + "\n\n".join(advice_items)
                )))
            buffered_deltas: List[str] = []
            graph = SingleAgentGraph(
                api_key=provider["apiKey"], base_url=provider["baseUrl"], model=provider["model"],
                tools=registry.definitions(True),
                on_delta=(
                    (lambda delta: buffered_deltas.append(delta))
                    if team_task else (lambda delta: emit("model.delta", {"delta": delta}))
                ),
                cancel_event=cancel, max_tokens=4096,
            )
            for _step in range(self.max_tool_steps):
                if cancel.is_set():
                    raise RunCancelled("Run was cancelled")
                buffered_deltas.clear()
                response = graph.invoke(messages)
                self._record_usage(run_id, thread_id, role_id, provider, response)
                messages.append(response)
                tool_calls = getattr(response, "tool_calls", []) or []
                if not tool_calls:
                    content = response.content if isinstance(response.content, str) else json.dumps(response.content, ensure_ascii=False)
                    if team_task and specialist_ids:
                        content = self._quality_gate(
                            run_id, thread_id, latest_prompt, content, specialist_ids[0],
                            role_id, provider, messages, cancel, emit,
                        )
                        emit("model.delta", {"delta": content})
                    self.database.add_message(thread_id, run_id, "assistant", content, role_id)
                    self.database.set_run_status(run_id, "completed")
                    emit("run.completed", {"runId": run_id, "threadId": thread_id, "content": content, "roleId": role_id, "roleName": provider["name"]})
                    return
                for call in tool_calls:
                    name = call.get("name", "")
                    arguments = call.get("args", {})
                    call_id = call.get("id") or f"tool-{sequence}"
                    definition = registry.describe(name)
                    emit("tool.requested", {
                        "toolCallId": call_id, "name": name, "arguments": arguments,
                        "risk": definition.risk, "approvalRequired": definition.approval_required,
                    })
                    needs_approval = self._needs_approval(
                        approval_mode, definition.risk, definition.approval_required
                    )
                    if needs_approval:
                        approval_id = self.database.create_approval(run_id, name, arguments)
                        pending = PendingApproval(run_id)
                        with self._state_lock:
                            self._approvals[approval_id] = pending
                        self.database.set_run_status(run_id, "waiting_approval")
                        self.database.save_checkpoint(run_id, {"status": "waiting_approval", "tool": name, "arguments": arguments})
                        emit("approval.required", {
                            "approvalId": approval_id, "toolCallId": call_id, "name": name,
                            "arguments": arguments, "risk": definition.risk,
                            "summary": self._approval_summary(name, arguments),
                        })
                        while not pending.decision.wait(0.2):
                            if cancel.is_set() or self._shutdown.is_set():
                                raise RunCancelled("Run was cancelled")
                        with self._state_lock:
                            self._approvals.pop(approval_id, None)
                        self.database.set_run_status(run_id, "running")
                        if not pending.approved:
                            result = "User denied this tool operation."
                            emit("tool.completed", {"toolCallId": call_id, "name": name, "approved": False, "result": result})
                            messages.append(ToolMessage(content=result, tool_call_id=call_id))
                            continue
                    try:
                        if definition.approval_required:
                            self.database.save_checkpoint(run_id, {"sideEffectStarted": True})
                        result = registry.execute(name, arguments)
                        if definition.approval_required:
                            self.database.save_checkpoint(run_id, {"sideEffectsCompleted": True})
                        emit("tool.completed", {"toolCallId": call_id, "name": name, "approved": True, "result": result[:65536]})
                    except ToolError as exc:
                        result = f"Tool error: {exc}"
                        emit("tool.completed", {"toolCallId": call_id, "name": name, "approved": True, "error": result})
                    messages.append(ToolMessage(content=result, tool_call_id=call_id))
                self.database.save_checkpoint(run_id, {"status": "running", "completedToolStep": _step + 1})
            raise RuntimeError(f"Agent exceeded the {self.max_tool_steps}-step tool limit")
        except RunCancelled:
            self.database.set_run_status(run_id, "cancelled")
            emit("run.cancelled", {"runId": run_id, "threadId": thread_id})
        except Exception as exc:
            safe_message = str(exc)[:1000] or "Agent run failed"
            print(f"run {run_id} failed: {type(exc).__name__}: {safe_message}", file=sys.stderr)
            if os.environ.get("AIVRA_DEBUG") == "1":
                traceback.print_exc(file=sys.stderr)
            self.database.set_run_status(run_id, "failed", safe_message)
            emit("run.failed", {"runId": run_id, "threadId": thread_id, "message": safe_message})
        finally:
            with self._state_lock:
                self._runs.pop(run_id, None)
                self._workers.pop(run_id, None)

    def _run_specialist(self, run_id: str, thread_id: str, role_id: str, provider: Dict[str, Any],
                        conversation: List[Any], workspace: Path, knowledge: KnowledgeRepository,
                        cancel: threading.Event) -> str:
        """Run a bounded read-only specialist loop; side effects remain coordinator-only."""
        registry = ToolRegistry(workspace, knowledge_search=knowledge.format_results)
        system = (
            f"你是 WorkBee 专家 Agent {provider['name']}。职责：{provider.get('description', '')}。"
            f"技能：{'、'.join(provider.get('skills', [])) or '通用分析'}。"
            "独立分析当前任务，主动使用只读工具核验工作区事实。优先使用 search_knowledge 跨文件检索，"
            "必要时再读取具体文件。不得提出或执行写文件、命令、GitHub 修改等副作用操作。"
            "输出给协调者的内容应包含：结论、证据路径与行号、风险或待确认项、建议动作。"
        )
        messages: List[Any] = [SystemMessage(content=system), *conversation]
        graph = SingleAgentGraph(
            api_key=provider["apiKey"], base_url=provider["baseUrl"], model=provider["model"],
            tools=registry.definitions(False), on_delta=lambda _delta: None,
            cancel_event=cancel, streaming=False, max_tokens=1600,
        )
        for step in range(5):
            if cancel.is_set():
                raise RunCancelled("Run was cancelled")
            response = graph.invoke(messages)
            self._record_usage(run_id, thread_id, role_id, provider, response)
            messages.append(response)
            tool_calls = getattr(response, "tool_calls", []) or []
            if not tool_calls:
                return response.content if isinstance(response.content, str) else json.dumps(response.content, ensure_ascii=False)
            for call in tool_calls:
                call_id = call.get("id") or f"specialist-{role_id}-{step}"
                name = str(call.get("name") or "")
                arguments = call.get("args", {})
                try:
                    definition = registry.describe(name)
                    if definition.approval_required:
                        raise ToolError("Specialist agents may use read-only tools only")
                    result = registry.execute(name, arguments)
                except ToolError as exc:
                    result = f"Tool error: {exc}"
                messages.append(ToolMessage(content=result[:65536], tool_call_id=call_id))
        raise RuntimeError(f"专家 Agent {provider['name']} 超过 5 步只读工具限制")

    def _quality_gate(self, run_id: str, thread_id: str, task: str, draft: str, reviewer_id: str,
                      coordinator_id: str, coordinator: Dict[str, Any], messages: List[Any], cancel: threading.Event,
                      emit: Any) -> str:
        """Use a separate bounded Agent to review the draft, then let the coordinator repair it once."""
        reviewer = self.providers[reviewer_id]
        quality_task_id = self.database.create_agent_task(
            run_id, reviewer_id, f"{reviewer['name']} · 质检", "核验最终答案的事实依据、任务覆盖与风险披露"
        )
        self.database.update_agent_task(quality_task_id, "running")
        emit("quality.started", {"taskId": quality_task_id, "roleId": reviewer_id, "name": reviewer["name"]})
        try:
            graph = SingleAgentGraph(
                api_key=reviewer["apiKey"], base_url=reviewer["baseUrl"], model=reviewer["model"], tools=[],
                on_delta=lambda _delta: None, cancel_event=cancel, streaming=False,
                temperature=0, timeout=45, max_retries=1, max_tokens=512,
            )
            review_response = graph.invoke([
                SystemMessage(content=(
                    "你是独立交付质检 Agent。检查答案是否覆盖任务、是否把猜测当事实、"
                    "涉及工作区事实时是否给出可核验路径或证据、是否遗漏风险。"
                    "只输出 JSON：{\"pass\":true|false,\"issues\":[\"具体问题\"]}。最多 5 个问题。"
                )),
                HumanMessage(content=f"原任务：\n{task[:4000]}\n\n待检答案：\n{draft[:16000]}"),
            ])
            self._record_usage(run_id, thread_id, reviewer_id, reviewer, review_response)
            review_text = review_response.content if isinstance(review_response.content, str) else json.dumps(review_response.content, ensure_ascii=False)
            parsed = json.loads(re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", review_text, flags=re.IGNORECASE))
            issues = parsed.get("issues", []) if isinstance(parsed, dict) else []
            passed = isinstance(parsed, dict) and parsed.get("pass") is True
            issue_text = "\n".join(f"- {str(item)[:500]}" for item in issues[:5] if str(item).strip())
            self.database.update_agent_task(quality_task_id, "completed", review_text[:4000])
            emit("quality.completed", {
                "taskId": quality_task_id, "roleId": reviewer_id,
                "passed": passed, "issueCount": len(issues[:5]),
            })
            if passed or not issue_text:
                return draft
            revision_graph = SingleAgentGraph(
                api_key=coordinator["apiKey"], base_url=coordinator["baseUrl"], model=coordinator["model"], tools=[],
                on_delta=lambda _delta: None, cancel_event=cancel, streaming=False,
                temperature=0.1, timeout=60, max_retries=1, max_tokens=4096,
            )
            revision = revision_graph.invoke([
                *messages,
                AIMessage(content=draft),
                SystemMessage(content=(
                    "独立质检发现以下问题。只修复这些问题并输出完整最终答案；"
                    "不得声称执行新的工具或补造证据。\n" + issue_text
                )),
            ])
            self._record_usage(run_id, thread_id, coordinator_id, coordinator, revision)
            return revision.content if isinstance(revision.content, str) else json.dumps(revision.content, ensure_ascii=False)
        except RunCancelled:
            self.database.update_agent_task(quality_task_id, "cancelled")
            raise
        except Exception as exc:
            self.database.update_agent_task(quality_task_id, "failed", error=str(exc)[:1000])
            emit("quality.failed", {"taskId": quality_task_id, "roleId": reviewer_id, "message": str(exc)[:500]})
            return draft

    def _schedule_lexical_index(self, workspace: Dict[str, Any]) -> None:
        """Warm the no-cost local FTS index without blocking workspace selection."""
        workspace_id = str(workspace["id"])
        with self._state_lock:
            if workspace_id in self._indexing_workspaces:
                return
            self._indexing_workspaces.add(workspace_id)

        def refresh() -> None:
            try:
                KnowledgeRepository(
                    self.database, workspace_id, Path(str(workspace["path"]))
                ).index()
            except Exception as exc:
                self.diagnostic(f"Background knowledge indexing failed: {str(exc)[:500]}")
            finally:
                with self._state_lock:
                    self._indexing_workspaces.discard(workspace_id)

        threading.Thread(
            target=refresh, name=f"aivra-index-{workspace_id[:8]}", daemon=True
        ).start()

    @staticmethod
    def _needs_approval(approval_mode: str, risk: str, approval_required: bool) -> bool:
        """Apply the product-level permission policy independently of chat/task mode."""
        if not approval_required or approval_mode == "full":
            return False
        if approval_mode == "request":
            return True
        return approval_mode == "auto" and risk == "high"

    @staticmethod
    def _approval_summary(name: str, arguments: Dict[str, Any]) -> str:
        if name == "write_file":
            return f"写入文件：{arguments.get('path', '')}"
        if name == "run_command":
            command = arguments.get("command", "")
            args = arguments.get("arguments", [])
            return f"在工作区沙箱中运行：{command} {' '.join(str(item) for item in args)}"[:500]
        if name.startswith("github_"):
            return f"调用 GitHub MCP 工具：{name}"
        return f"执行工具：{name}"

    def _record_usage(self, run_id: str, thread_id: str, role_id: str, provider: Dict[str, Any], response: Any) -> None:
        usage = getattr(response, "usage_metadata", None) or {}
        if not usage:
            metadata = getattr(response, "response_metadata", None) or {}
            usage = metadata.get("token_usage") or metadata.get("usage") or {}
        input_tokens = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
        total_tokens = int(usage.get("total_tokens") or input_tokens + output_tokens)
        self.database.record_token_usage(run_id, thread_id, role_id, provider["modelId"], provider["model"], input_tokens, output_tokens, total_tokens)

    @staticmethod
    def _workspace_tree(root: Path) -> List[Dict[str, Any]]:
        ignored = {".git", "node_modules", ".venv", "dist", "release", "__pycache__"}
        count = 0
        def walk(directory: Path, depth: int) -> List[Dict[str, Any]]:
            nonlocal count
            if depth > 8 or count >= 1500:
                return []
            result: List[Dict[str, Any]] = []
            try:
                entries = sorted(directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
            except OSError:
                return result
            for entry in entries:
                if entry.name in ignored or entry.is_symlink() or count >= 1500:
                    continue
                count += 1
                relative = str(entry.relative_to(root))
                node: Dict[str, Any] = {"name": entry.name, "path": relative, "type": "directory" if entry.is_dir() else "file"}
                if entry.is_dir():
                    node["children"] = walk(entry, depth + 1)
                result.append(node)
            return result
        return walk(root, 0)

    def shutdown(self) -> None:
        self._shutdown.set()
        with self._state_lock:
            for cancel in self._runs.values():
                cancel.set()
            for approval in self._approvals.values():
                approval.decision.set()
            workers = list(self._workers.values())
        for worker in workers:
            worker.join(timeout=2)
        self.database.close()


def main() -> None:
    configure_standard_streams()
    server = AgentServer()
    try:
        server.serve()
    except KeyboardInterrupt:
        server.shutdown()
