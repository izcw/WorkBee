import { Bot, FolderOpen, KeyRound, LoaderCircle, Plus, RotateCcw, Settings2, TestTube2, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAgent } from '../agent/AgentContext';
import { Avatar } from './ui';
import { ModalDialog } from './ModalDialog';

type Section = 'profile' | 'general' | 'models';

export function SettingsDialog({ close, initialSection = 'profile' }: { close: () => void; initialSection?: Section }) {
  const { models, usage, createModel, updateModel, deleteModel, testModel } = useAgent();
  const [section, setSection] = useState<Section>(initialSection);
  const [editingId, setEditingId] = useState<string | null>(models[0]?.id || null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [purpose, setPurpose] = useState<'chat' | 'embedding'>('chat');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const editing = models.find(item => item.id === editingId);
  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    if (!editing) return;
    setName(editing.name); setBaseUrl(editing.baseUrl); setModel(editing.model); setPurpose(editing.purpose || 'chat');
    setApiKey(''); setClearApiKey(false); setError(''); setTestResult('');
  }, [editingId, editing]);

  const add = () => {
    setEditingId(null); setName(''); setBaseUrl('https://api.openai.com/v1'); setModel(''); setPurpose('chat');
    setApiKey(''); setClearApiKey(false); setError('');
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      if (editingId) await updateModel({ id: editingId, name, baseUrl, model, purpose, apiKey: apiKey || undefined, clearApiKey });
      else {
        const created = await createModel({ name, baseUrl, model, purpose, apiKey: apiKey || undefined });
        setEditingId(created.id);
      }
      setApiKey(''); setClearApiKey(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editingId || !confirm(`确定删除模型“${editing?.name}”吗？`)) return;
    setSaving(true); setError('');
    try { await deleteModel(editingId); setEditingId(models.find(item => item.id !== editingId)?.id || null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const testConnection = async () => {
    setTesting(true); setError(''); setTestResult('');
    try {
      const result = await testModel({ id: editingId || undefined, name, baseUrl, model, purpose, apiKey: apiKey || undefined });
      setTestResult(`${result.message} · ${result.latencyMs}ms`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setTesting(false); }
  };

  return <ModalDialog title="设置" close={close} className="settings-window">
      <div className="settings-layout">
        <nav>
          <button className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}><UserRound size={16}/>个人资料</button>
          <button className={section === 'general' ? 'active' : ''} onClick={() => setSection('general')}><Settings2 size={16}/>通用</button>
          <button className={section === 'models' ? 'active' : ''} onClick={() => setSection('models')}><Bot size={16}/>模型</button>
        </nav>
        <main>
          {section === 'profile' && <ProfileSettings usage={usage}/>} 
          {section === 'general' && <GeneralSettings/>}
          {section === 'models' && <div className="model-settings">
            <div className="settings-title"><div><h2>模型</h2><p>管理 OpenAI-compatible 对话与 Embedding 模型。启用 Embedding 会把工作区文本片段发送给所配置的模型服务。</p></div><button onClick={add}><Plus size={15}/>添加</button></div>
            <div className="model-settings-body">
              <aside>{models.map(item => { const stats = usage.byModel.find(stat => stat.model_id === item.id); return <button key={item.id} className={item.id === editingId ? 'active' : ''} onClick={() => setEditingId(item.id)}><span><strong>{item.name}</strong><small>{item.purpose === 'embedding' ? 'Embedding' : '对话'} · {item.model}</small><small>{formatTokens(stats?.total_tokens || 0)} Token</small></span><i className={item.keyAvailable ? 'ready' : ''}/></button>; })}</aside>
              <div className="model-form">
                <h3>{editingId ? '编辑模型' : '添加模型'}</h3>
                {editingId && <div className="model-usage-summary"><span>累计 Token</span><strong>{formatTokens(usage.byModel.find(item => item.model_id === editingId)?.total_tokens || 0)}</strong><small>{usage.byModel.find(item => item.model_id === editingId)?.conversations || 0} 次任务</small></div>}
                <label>显示名称<input value={name} onChange={event => setName(event.target.value)} placeholder="例如 DeepSeek"/></label>
                <label>模型用途<select value={purpose} onChange={event => setPurpose(event.target.value as 'chat' | 'embedding')}><option value="chat">对话与 Agent</option><option value="embedding">知识库 Embedding</option></select></label>
                <label>Base URL<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.xxx"/></label>
                <label>Model<input value={model} onChange={event => setModel(event.target.value)} placeholder="模型标识"/></label>
                <label>API Key <span>{editing?.keyAvailable ? editing.maskedKey : '未配置'}</span><div className="model-key"><KeyRound size={15}/><input type="password" autoComplete="off" value={apiKey} onChange={event => { setApiKey(event.target.value); setClearApiKey(false); }} placeholder={editing?.maskedKey || 'sk-…'}/></div></label>
                {editing?.keyAvailable && <label className="clear-key"><input type="checkbox" checked={clearApiKey} onChange={event => { setClearApiKey(event.target.checked); setApiKey(''); }}/>移除当前 API Key</label>}
                {error && <p className="model-error">{error}</p>}{testResult && <p className="model-test-success">{testResult}</p>}
                <footer>{editingId && <button className="delete-model" disabled={saving || testing} onClick={remove}><Trash2 size={14}/>删除</button>}<button className={`test-model ${testing ? 'testing' : ''}`} disabled={saving || testing || !baseUrl.trim() || !model.trim()} onClick={testConnection}>{testing ? <LoaderCircle size={14}/> : <TestTube2 size={14}/>}测试连接</button><button className="save-model" disabled={saving || testing || !name.trim() || !baseUrl.trim() || !model.trim()} onClick={save}>{saving && <LoaderCircle size={14}/>}保存</button></footer>
              </div>
            </div>
          </div>}
        </main>
      </div>
  </ModalDialog>;
}

function formatTokens(value: number) { return new Intl.NumberFormat('zh-CN').format(value); }
function formatDuration(seconds: number) { if (seconds < 60) return `${seconds} 秒`; if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`; return `${(seconds / 3600).toFixed(1)} 小时`; }

const localDataKeys = ['aivra.workflows.v5', 'aivra.workflows.v4', 'aivra.workflows.v3', 'aivra.projectPreferences.v1', 'aivra.activeProject.v1', 'aivra.activeThread.v1', 'aivra.tasks.v1', 'aivra.tasks.archive.v1', 'aivra.markdown-documents.v1', 'aivra.expandedProjects.v1'];

function GeneralSettings() {
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [defaultWorkspaceDir, setDefaultWorkspaceDir] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.aivraDesktop?.settings.get()
      .then(settings => { setWorkspaceDir(settings.workspaceDir); setDefaultWorkspaceDir(settings.defaultWorkspaceDir); })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const changeWorkspaceDir = async () => {
    setBusy(true); setError('');
    try {
      const selected = await window.aivraDesktop?.settings.selectWorkspaceDir();
      if (selected) setWorkspaceDir(selected.workspaceDir);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const resetWorkspaceDir = async () => {
    setBusy(true); setError('');
    try {
      const result = await window.aivraDesktop?.settings.resetWorkspaceDir();
      if (result) setWorkspaceDir(result.workspaceDir);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const resetAll = async () => {
    if (!confirm('确定清除所有用户自定义数据并恢复默认吗？\n\n将清除：项目与对话记录、团队角色、模型配置与 API Key、插件连接与 MCP 配置、自定义文档、本地缓存。\n\n将保留：默认团队角色、内置知识库与内置技能。\n\n此操作无法恢复。')) return;
    setBusy(true); setError('');
    try {
      await window.aivraDesktop?.settings.reset();
      localDataKeys.forEach(key => localStorage.removeItem(key));
      location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };

  const currentDir = workspaceDir || defaultWorkspaceDir;
  return <div className="general-settings">
    <h2>通用</h2>
    <div className="settings-card">
      <header><div><h3>产物目录</h3><p>新建空间的默认存储位置，新创建的项目将存放在该目录下的独立文件夹中。</p></div></header>
      <div className="path-row">
        <span className="path-value" title={currentDir}>{currentDir}</span>
        <button onClick={changeWorkspaceDir} disabled={busy}><FolderOpen size={14}/>更改</button>
        <button onClick={resetWorkspaceDir} disabled={busy}><RotateCcw size={14}/>恢复默认</button>
      </div>
      {error && <p className="model-error">{error}</p>}
    </div>
    <div className="settings-card danger">
      <header><div><h3>清除软件数据</h3><p>清除项目、对话、团队角色、模型、插件、文档等用户自定义内容，恢复初始默认状态。</p></div></header>
      <button className="danger-button" disabled={busy} onClick={resetAll}><TriangleAlert size={14}/>清除用户数据并恢复默认</button>
    </div>
  </div>;
}

function ProfileSettings({ usage }: { usage: UsageSummary }) {
  const days = heatmapDays(usage.daily);
  const max = Math.max(1, ...days.map(day => day.tokens));
  return <div className="profile-settings"><div className="profile-identity"><h2>Yoko</h2><p>izcw@workbee.ai</p></div><div className="profile-metrics"><div><strong>{formatTokens(usage.totalTokens)}</strong><span>累计 Token</span></div><div><strong>{formatTokens(usage.peakTokens)}</strong><span>单任务峰值</span></div><div><strong>{formatDuration(usage.longestTaskSeconds)}</strong><span>最长任务时长</span></div></div><section className="token-activity"><header><div><h3>Token 活动</h3><p>过去 52 周每天的模型使用量</p></div><strong>{formatTokens(usage.totalTokens)} Token</strong></header><div className="token-heatmap" aria-label="Token 活动热力图">{days.map(day => { const level = day.tokens ? Math.max(1, Math.min(4, Math.ceil(day.tokens / max * 4))) : 0; return <i key={day.date} className={`level-${level} ${day.future ? 'future' : ''}`} title={day.future ? day.date : `${day.date} · ${formatTokens(day.tokens)} Token`}/>; })}</div><footer><span>少</span>{[0,1,2,3,4].map(level => <i key={level} className={`level-${level}`}/>)}<span>多</span></footer></section></div>;
}

function heatmapDays(daily: UsageSummary['daily']) {
  const map = new Map(daily.map(item => [item.date, item.tokens]));
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const end = new Date(today); end.setDate(today.getDate() + (6 - today.getDay()));
  const start = new Date(end); start.setDate(end.getDate() - 363);
  return Array.from({ length: 364 }, (_, index) => {
    const day = new Date(start); day.setDate(start.getDate() + index);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { date, tokens: map.get(date) || 0, future: day > today };
  });
}
