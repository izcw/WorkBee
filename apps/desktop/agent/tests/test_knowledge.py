from pathlib import Path

from aivra_agent.knowledge import KnowledgeRepository
from aivra_agent.storage import Database
from aivra_agent.tools import ToolRegistry


class FakeEmbedder:
    model_id = "fake-embedding"

    def documents(self, texts):
        return [[1.0, 0.0] if "苹果" in text else [0.0, 1.0] for text in texts]

    def query(self, text):
        return [1.0, 0.0] if "水果" in text else [0.0, 1.0]


def test_workspace_knowledge_is_incremental_searchable_and_cited(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    readme = workspace / "README.md"
    readme.write_text("# WorkBee\n\n审批操作由运行时统一控制。\n", encoding="utf-8")
    database = Database(tmp_path / "knowledge.sqlite3")
    selected = database.select_workspace(workspace)
    knowledge = KnowledgeRepository(database, selected["id"], workspace)

    first = knowledge.index()
    second = knowledge.index()
    result = knowledge.format_results("项目中的审批操作怎么实现")

    assert first["indexed"] == 1
    assert second["indexed"] == 0
    assert second["unchanged"] == 1
    assert "README.md:1" in result
    assert "审批操作由运行时统一控制" in result

    readme.write_text("# WorkBee\n\n知识检索返回来源行号。\n", encoding="utf-8")
    updated = knowledge.index()
    assert updated["indexed"] == 1
    assert "来源行号" in knowledge.format_results("知识检索")
    assert "审批操作" not in knowledge.format_results("审批操作")
    database.close()


def test_knowledge_search_is_scoped_to_workspace_and_exposed_as_read_only_tool(tmp_path: Path):
    first_path = tmp_path / "first"
    second_path = tmp_path / "second"
    first_path.mkdir()
    second_path.mkdir()
    (first_path / "notes.md").write_text("仅属于项目甲的秘密约定", encoding="utf-8")
    (second_path / "notes.md").write_text("仅属于项目乙的发布规则", encoding="utf-8")
    database = Database(tmp_path / "scoped.sqlite3")
    first = database.select_workspace(first_path)
    second = database.select_workspace(second_path)
    first_knowledge = KnowledgeRepository(database, first["id"], first_path)
    second_knowledge = KnowledgeRepository(database, second["id"], second_path)
    first_knowledge.index()
    second_knowledge.index()

    assert "项目甲" in first_knowledge.format_results("秘密约定")
    assert "项目甲" not in second_knowledge.format_results("秘密约定")
    registry = ToolRegistry(first_path, knowledge_search=first_knowledge.format_results)
    assert registry.describe("search_knowledge").approval_required is False
    assert "notes.md:1" in registry.execute("search_knowledge", {"query": "秘密约定"})
    database.close()


def test_hybrid_retrieval_can_recall_semantically_related_chunk(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "fruit.md").write_text("苹果富含膳食纤维", encoding="utf-8")
    (workspace / "code.md").write_text("Python 使用缩进组织代码", encoding="utf-8")
    database = Database(tmp_path / "hybrid.sqlite3")
    selected = database.select_workspace(workspace)
    knowledge = KnowledgeRepository(database, selected["id"], workspace, FakeEmbedder())
    knowledge.index()

    results = knowledge.search("推荐一种水果", 1)

    assert results[0]["path"] == "fruit.md"
    database.close()


def test_index_respects_gitignore_and_aivraignore_with_negation(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "keep.md").write_text("保留的知识证据", encoding="utf-8")
    (workspace / "debug.log").write_text("不应进入知识库", encoding="utf-8")
    generated = workspace / "generated"
    generated.mkdir()
    (generated / "hidden.md").write_text("生成内容", encoding="utf-8")
    (generated / "important.md").write_text("重要例外证据", encoding="utf-8")
    (workspace / ".gitignore").write_text("*.log\n", encoding="utf-8")
    (workspace / ".aivraignore").write_text("generated/\n!generated/important.md\n", encoding="utf-8")
    database = Database(tmp_path / "knowledge-ignore.sqlite3")
    selected = database.select_workspace(workspace)
    repository = KnowledgeRepository(database, selected["id"], workspace)

    stats = repository.index()

    assert stats["files"] == 2
    assert "keep.md" in {item["path"] for item in repository.search("保留的知识证据")}
    assert "generated/important.md" in {item["path"] for item in repository.search("重要例外证据")}
    assert repository.search("生成内容") == []
    database.close()
