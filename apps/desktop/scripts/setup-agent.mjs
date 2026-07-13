import { existsSync } from 'node:fs';
import { agentRoot, findBootstrapPython, run, venvPython } from './python-tools.mjs';

if (!existsSync(venvPython)) run(findBootstrapPython(), ['-m', 'venv', `${agentRoot}/.venv`]);
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-e', `${agentRoot}[dev]`]);
