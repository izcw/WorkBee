# Aivra Python Agent

Python Agent 通过 stdin/stdout 接收一行一个 JSON 对象，stdout 只输出协议消息，诊断日志只写 stderr。开发入口为 `python -m aivra_agent`。

核心模块：

- `runtime/`：握手、请求分发、运行线程、取消、审批和事件顺序；
- `graphs/`：LangGraph 单 Agent 模型步骤；
- `tools/`：统一工具注册、工作区约束与风险声明；
- `storage/`：SQLite migration、任务历史、审批与 checkpoint。

测试不访问外部模型服务：

```bash
../agent/.venv/bin/python -m pytest tests
```
