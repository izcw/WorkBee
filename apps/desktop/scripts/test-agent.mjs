import { agentRoot, run, venvPython } from './python-tools.mjs';

run(venvPython, ['-m', 'pytest', `${agentRoot}/tests`]);
