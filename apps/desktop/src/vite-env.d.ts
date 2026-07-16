/// <reference types="vite/client" />

type AgentEvent = {
  protocolVersion: 1;
  id: string;
  kind: 'event';
  type: string;
  timestamp: string;
  runId?: string;
  sequence?: number;
  payload: Record<string, unknown>;
  error?: { code: string; message: string; retryable?: boolean };
};

type Workspace = { id: string; path: string; name: string; created_at?: string; last_opened_at?: string; thread_count?: number };
type FileTreeNode = { name: string; path: string; type: 'file' | 'directory'; children?: FileTreeNode[] };
type UsageSummary = { totalTokens: number; peakTokens: number; longestTaskSeconds: number; byModel: Array<{ model_id: string; model: string; input_tokens: number; output_tokens: number; total_tokens: number; conversations: number }>; daily: Array<{ date: string; tokens: number; conversations: number }> };
type ModelConfig = { id: string; name: string; baseUrl: string; model: string; keyAvailable: boolean; maskedKey: string };
type RoleConfig = { id: string; name: string; role: string; avatar?: string; modelId: string; modelName: string; baseUrl: string; model: string; keyAvailable: boolean; description: string; skills: string[]; knowledge: string[] };
type ModelInput = { id?: string; name: string; baseUrl: string; model: string; apiKey?: string; clearApiKey?: boolean };

interface Window {
  aivraDesktop?: {
    platform: string;
    isDesktop: true;
    window: { minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void> };
    agent: {
      status(): Promise<Record<string, unknown>>;
      ensureReady(): Promise<Record<string, unknown>>;
      selectWorkspace(): Promise<Workspace | null>;
      openWorkspace(workspacePath: string): Promise<void>;
      executeCommand(input: { command: string; cwd?: string }): Promise<{ stdout: string; stderr: string; code: number }>;
      createProject(): Promise<Workspace>;
      listWorkspaces(): Promise<Workspace[]>;
      deleteWorkspace(workspaceId: string): Promise<{ workspaceId: string; deleted: boolean }>;
      renameWorkspace(input: { workspaceId: string; name: string }): Promise<{ workspaceId: string; name: string; updated: boolean }>;
      listThreads(workspaceId?: string): Promise<ThreadSummary[]>;
      createThread(workspaceId: string): Promise<{ threadId: string }>;
      deleteThread(threadId: string): Promise<{ threadId: string; deleted: boolean }>;
      workspaceTree(workspaceId: string): Promise<FileTreeNode[]>;
      usageSummary(): Promise<UsageSummary>;
      getThread(threadId: string): Promise<ThreadDetail>;
      createRun(input: { workspaceId: string; threadId?: string; prompt: string; mode: 'chat' | 'task'; roleIds: string[]; approvalMode: 'request' | 'auto' | 'full'; workflowName?: string; documents?: string[] }): Promise<{ runId: string; threadId: string; roleIds: string[] }>;
      cancelRun(runId: string): Promise<{ accepted: boolean }>;
      resolveApproval(input: { approvalId: string; approved: boolean }): Promise<{ accepted: boolean }>;
      onEvent(callback: (event: AgentEvent) => void): () => void;
      onStatus(callback: (status: Record<string, unknown>) => void): () => void;
    };
    models: {
      list(): Promise<ModelConfig[]>;
      create(input: ModelInput): Promise<ModelConfig>;
      update(input: ModelInput & { id: string }): Promise<ModelConfig>;
      delete(modelId: string): Promise<{ deleted: boolean }>;
      test(input: ModelInput): Promise<{ success: boolean; latencyMs: number; message: string }>;
    };
    roles: {
      list(): Promise<RoleConfig[]>;
      save(input: { id?: string; name?: string; role?: string; avatar?: string; modelId: string; description?: string; skills?: string[]; knowledge?: string[] }): Promise<RoleConfig>;
    };
    plugins: {
      githubStatus(): Promise<{ connected: boolean; serverUrl: string }>;
      openGithubTokenPage(): Promise<{ opened: boolean }>;
      connectGithub(input: { token: string }): Promise<{ connected: boolean; serverUrl: string }>;
      disconnectGithub(): Promise<{ connected: boolean }>;
    };
  };
}

type ThreadSummary = {
  id: string; workspace_id: string; workspace_name: string; title: string; created_at: string; updated_at: string;
};

type ThreadMessage = { id: string; run_id?: string; role: 'user' | 'assistant'; role_id?: string; content: string; created_at: string };
type ThreadDetail = ThreadSummary & { messages: ThreadMessage[]; runs: unknown[]; approvals: unknown[] };
