import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const root = path.resolve(import.meta.dirname, '..');
export const agentRoot = path.join(root, 'agent');
export const venvPython = process.platform === 'win32'
  ? path.join(agentRoot, '.venv', 'Scripts', 'python.exe')
  : path.join(agentRoot, '.venv', 'bin', 'python');

export function findBootstrapPython() {
  const candidates = [process.env.WORKBEE_PYTHON, 'python3.12', '/opt/homebrew/bin/python3.12', 'python3.11', '/opt/homebrew/bin/python3.11', 'python3'].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue;
    const check = spawnSync(candidate, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)'], { stdio: 'ignore' });
    if (check.status === 0) return candidate;
  }
  throw new Error('需要 Python 3.11+（发布构建推荐 Python 3.12）');
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
