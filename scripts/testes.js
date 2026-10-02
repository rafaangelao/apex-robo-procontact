// scripts/testes.js — roda todos os test/*.test.js passando a lista explícita de arquivos
// (o glob do `node --test` estourava memória no Windows).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arquivos = readdirSync('test').filter((f) => f.endsWith('.test.js')).sort().map((f) => `test/${f}`);
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...arquivos], { stdio: 'inherit' });
process.exit(r.status ?? 1);
