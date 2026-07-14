from __future__ import annotations

import json
import os
import re
import sys
import threading
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from .. import __version__
from ..graphs import RunCancelled, SingleAgentGraph
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


@dataclass
class PendingApproval:
    run_id: str
    decision: threading.Event = field(default_factory=threading.Event)
    approved: bool = False


class AgentServer:
    def __init__(self) -> None:
        data_dir = Path(os.environ.get("AIVRA_DATA_DIR", str(Path.home() / ".aivra")))
        self.database = Database(data_dir / "aivra.sqlite3")
        self.api_key = os.environ.get("AIVRA_DEEPSEEK_API_KEY", "")
        self.model = os.environ.get("AIVRA_MODEL", "deepseek-v4-flash")
        self.base_url = os.environ.get("AIVRA_BASE_URL", "https://api.deepseek.com")
        self.providers = self._load_providers()
        self._write_lock = threading.Lock()
        self._shutdown = threading.Event()
        self._runs: Dict[str, threading.Event] = {}
        self._workers: Dict[str, threading.Thread] = {}
        self._approvals: Dict[str, PendingApproval] = {}
        self._state_lock = threading.RLock()

    def _load_providers(self) -> Dict[str, Dict[str, Any]]:
        fallback = {"aivra": {"name": "Aivra", "description": "默认 Agent", "skills": [], "knowledge": [], "apiKey": self.api_key, "modelId": self.model, "model": self.model, "baseUrl": self.base_url}}
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
                "capabilities": ["workspace", "chat", "tools", "approval", "cancel", "persistence"],
                "provider": {"roles": [{"id": role_id, "name": value["name"], "model": value["model"], "baseUrl": value["baseUrl"], "keyAvailable": bool(value["apiKey"])} for role_id, value in self.providers.items()]},
            })
        elif message_type == "runtime.health":
            self.respond(request, "runtime.health", {"status": "ready", "activeRuns": len(self._runs)})
        elif message_type == "runtime.shutdown":
            self.respond(request, "runtime.shutdown", {"accepted": True})
            return True
        elif message_type == "workspace.select":
            workspace = self.database.select_workspace(Path(self._required_string(payload, "path")), str(payload.get("name") or "").strip()[:80] or None)
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

        def emit(message_type: str, payload: Dict[str, Any]) -> None:
            nonlocal sequence
            sequence += 1
            self.event(message_type, payload, run_id, sequence)

        try:
            role_id = role_ids[0]
            provider = self.providers[role_id]
            missing = next((self.providers[item] for item in role_ids if not self.providers[item]["apiKey"]), None)
            if missing:
                raise RuntimeError(f"请先为角色 {missing['name']} 配置 API Key")
            self.database.set_run_status(run_id, "running")
            emit("run.started", {"runId": run_id, "threadId": thread_id, "roleIds": role_ids})
            thread = self.database.get_thread(thread_id)
            assert thread is not None
            if len(role_ids) > 1:
                emit("team.selecting", {"roleIds": role_ids, "names": [self.providers[item]["name"] for item in role_ids]})
                router_role_id = role_id
                router_provider = provider
                selector_graph = SingleAgentGraph(
                    api_key=router_provider["apiKey"], base_url=router_provider["baseUrl"], model=router_provider["model"], tools=[],
                    on_delta=lambda _delta: None, cancel_event=cancel,
                )
                roster_order = [item for item in role_ids if item != "aivra"] + [item for item in role_ids if item == "aivra"]
                roster = "\n".join(
                    f"{item}: {self.providers[item]['name']} — {self.providers[item].get('description', '')}；"
                    f"技能：{'、'.join(self.providers[item].get('skills', []))}"
                    for item in roster_order
                )
                def dialogue_speaker(item: Dict[str, Any]) -> str:
                    if item["role"] == "user":
                        return "用户"
                    message_role_id = item.get("role_id")
                    return self.providers.get(message_role_id, {}).get("name", "助手")

                recent_dialogue = "\n".join(f"{dialogue_speaker(item)}: {item['content']}" for item in thread["messages"][-10:])
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
            registry = ToolRegistry(Path(workspace["path"]))
            team_names = "、".join(self.providers[item]["name"] for item in role_ids)
            knowledge_refs = provider.get("knowledge", [])
            knowledge_guidance = "\n".join(BUILTIN_KNOWLEDGE.get(item, f"知识库引用：{item}") for item in knowledge_refs)
            system = (
                f"你是 {provider['name']}。角色描述：{provider.get('description', '')}。已启用技能：{'、'.join(provider.get('skills', [])) or '通用能力'}。"
                f"内置知识与引用：{knowledge_guidance or '无'}。"
                f"当前参与任务的 Aivra 团队成员为：{team_names}。用中文简洁回答。"
                f"当前且唯一授权工作区是 {workspace['name']}。不得访问或操作该文件夹之外的任何路径。读取上下文时主动使用工具。"
                "不得声称执行过未调用的工具。你可以使用系统实际提供的读写与命令工具；是否需要用户批准由运行时按当前审批模式和风险等级决定，不要自行要求用户用文字确认。"
                "命令工具不经过 Shell，网络被禁用，写入仅限当前工作区。"
            )
            if workflow_name:
                system += f"当前流程为“{workflow_name}”。"
            if documents:
                knowledge_documents = [item for item in documents if item in BUILTIN_KNOWLEDGE]
                workspace_documents = [item for item in documents if item not in BUILTIN_KNOWLEDGE and not Path(item).is_absolute() and ".." not in Path(item).parts]
                if knowledge_documents:
                    system += "当前流程引用的知识库内容：" + "\n".join(BUILTIN_KNOWLEDGE[item] for item in knowledge_documents)
                if workspace_documents:
                    system += "本流程引用的工作区文档为：" + "、".join(workspace_documents) + "。需要内容时使用读取工具，不能假装已读。"
            messages: List[Any] = [SystemMessage(content=system)]
            for item in thread["messages"]:
                if item["role"] == "user":
                    messages.append(HumanMessage(content=item["content"]))
                elif item["role"] == "assistant":
                    messages.append(AIMessage(content=item["content"]))
            advice_items: List[str] = []
            for collaborator_id in role_ids[1:]:
                if cancel.is_set():
                    raise RunCancelled("Run was cancelled")
                collaborator = self.providers[collaborator_id]
                emit("agent.started", {"roleId": collaborator_id, "name": collaborator["name"], "model": collaborator["model"]})
                collaborator_graph = SingleAgentGraph(
                    api_key=collaborator["apiKey"], base_url=collaborator["baseUrl"], model=collaborator["model"], tools=[],
                    on_delta=lambda _delta: None, cancel_event=cancel,
                )
                collaborator_messages: List[Any] = [SystemMessage(content=(
                    f"你是 Aivra 团队成员 {collaborator['name']}。针对用户任务提供独立、简洁、可执行的专业分析，交给主协调者汇总。"
                    "不要声称已读取文件或执行工具，因为本阶段没有工具。"
                )), *messages[1:]]
                collaborator_response = collaborator_graph.invoke(collaborator_messages)
                self._record_usage(run_id, thread_id, collaborator_id, collaborator, collaborator_response)
                advice = collaborator_response.content if isinstance(collaborator_response.content, str) else json.dumps(collaborator_response.content, ensure_ascii=False)
                advice_items.append(f"{collaborator['name']} 的分析：\n{advice}")
                emit("agent.completed", {"roleId": collaborator_id, "name": collaborator["name"]})
            if advice_items:
                messages.insert(1, SystemMessage(content="以下是团队成员的独立分析，请核验后综合使用：\n\n" + "\n\n".join(advice_items)))
            graph = SingleAgentGraph(
                api_key=provider["apiKey"], base_url=provider["baseUrl"], model=provider["model"],
                tools=registry.definitions(True),
                on_delta=lambda delta: emit("model.delta", {"delta": delta}), cancel_event=cancel,
            )
            for _step in range(12):
                if cancel.is_set():
                    raise RunCancelled("Run was cancelled")
                response = graph.invoke(messages)
                self._record_usage(run_id, thread_id, role_id, provider, response)
                messages.append(response)
                tool_calls = getattr(response, "tool_calls", []) or []
                if not tool_calls:
                    content = response.content if isinstance(response.content, str) else json.dumps(response.content, ensure_ascii=False)
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
                        result = registry.execute(name, arguments)
                        emit("tool.completed", {"toolCallId": call_id, "name": name, "approved": True, "result": result[:65536]})
                    except ToolError as exc:
                        result = f"Tool error: {exc}"
                        emit("tool.completed", {"toolCallId": call_id, "name": name, "approved": True, "error": result})
                    messages.append(ToolMessage(content=result, tool_call_id=call_id))
                self.database.save_checkpoint(run_id, {"status": "running", "completedToolStep": _step + 1})
            raise RuntimeError("Agent exceeded the 12-step tool limit")
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
    server = AgentServer()
    try:
        server.serve()
    except KeyboardInterrupt:
        server.shutdown()
