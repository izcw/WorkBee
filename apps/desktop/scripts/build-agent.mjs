import { existsSync } from 'node:fs';
import path from 'node:path';
import { agentRoot, run, venvPython } from './python-tools.mjs';

if (!existsSync(venvPython)) {
  console.error('Agent 虚拟环境不存在，请先运行 npm run agent:setup');
  process.exit(1);
}

run(venvPython, [
  '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'workbee-agent',
  '--distpath', path.join(agentRoot, 'dist'), '--workpath', path.join(agentRoot, 'build'),
  '--specpath', agentRoot, '--paths', agentRoot,
  '--collect-all', 'langchain_openai', '--collect-all', 'langgraph',
  path.join(agentRoot, 'entrypoint.py'),
]);
