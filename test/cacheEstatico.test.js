import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { obterEstatico, ehEstatico } from '../src/cacheEstatico.js';

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
function resp(status, corpo, headers = {}) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => Buffer.from(corpo ?? '') };
}
function servidor(passos) {
  const chamadas = [];
  const fetchImpl = async (url, init) => { chamadas.push({ url, cond: init?.headers?.['if-none-match'] ?? null }); return passos.shift(); };
  return { fetchImpl, chamadas };
}

test('ehEstatico: só js/css/fontes/imagens do mesmo host', () => {
  const h = 'x.exemplo.com.br';
  assert.equal(ehEstatico(new URL('https://x.exemplo.com.br/js/app.js'), h), true);
  assert.equal(ehEstatico(new URL('https://x.exemplo.com.br/css/main.css?v=3'), h), true);
  assert.equal(ehEstatico(new URL('https://x.exemplo.com.br/fonts/a.woff2'), h), true);
  assert.equal(ehEstatico(new URL('https://x.exemplo.com.br/api/relatorio'), h), false);
  assert.equal(ehEstatico(new URL('https://x.exemplo.com.br/pages/login'), h), false);
  assert.equal(ehEstatico(new URL('https://outro.com/js/app.js'), h), false);
});
test('cache vazio: baixa, devolve e GRAVA (tem ETag)', async () => {
  const p = pasta();
  const { fetchImpl, chamadas } = servidor([resp(200, 'CORPO-1', { etag: '"v1"', 'content-type': 'application/javascript' })]);
  const r = await obterEstatico({ url: 'https://x/js/app.js', pastaCache: p, fetchImpl });
  assert.equal(r.origem, 'baixado');
  assert.equal(r.status, 200);
  assert.equal(r.body.toString(), 'CORPO-1');
  assert.equal(r.tipo, 'application/javascript');
  assert.equal(chamadas[0].cond, null);
  assert.equal(fs.readdirSync(p).length, 2);
});
test('cache cheio e servidor responde 304: serve do disco sem baixar de novo', async () => {
  const p = pasta();
  const um = servidor([resp(200, 'CORPO-1', { etag: '"v1"', 'content-type': 'text/css' })]);
  await obterEstatico({ url: 'https://x/css/main.css', pastaCache: p, fetchImpl: um.fetchImpl });
  const dois = servidor([resp(304, '')]);
  const r = await obterEstatico({ url: 'https://x/css/main.css', pastaCache: p, fetchImpl: dois.fetchImpl });
  assert.equal(r.origem, 'cache');
  assert.equal(r.body.toString(), 'CORPO-1');
  assert.equal(r.tipo, 'text/css');
  assert.equal(dois.chamadas[0].cond, '"v1"');
});
test('arquivo mudou (200 com ETag novo): baixa de novo e atualiza o cache', async () => {
  const p = pasta();
  await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: servidor([resp(200, 'VELHO', { etag: '"v1"' })]).fetchImpl });
  const r = await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: servidor([resp(200, 'NOVO', { etag: '"v2"' })]).fetchImpl });
  assert.equal(r.origem, 'baixado');
  assert.equal(r.body.toString(), 'NOVO');
  const dois = servidor([resp(304, '')]);
  const r2 = await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: dois.fetchImpl });
  assert.equal(r2.body.toString(), 'NOVO');
  assert.equal(dois.chamadas[0].cond, '"v2"');
});
test('resposta sem ETag não é guardada', async () => {
  const p = pasta();
  await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: servidor([resp(200, 'X', {})]).fetchImpl });
  assert.equal(fs.readdirSync(p).length, 0);
});
test('erro HTTP (404) é repassado e não é guardado', async () => {
  const p = pasta();
  const r = await obterEstatico({ url: 'https://x/js/falta.js', pastaCache: p, fetchImpl: servidor([resp(404, 'nada', { etag: '"e"' })]).fetchImpl });
  assert.equal(r.status, 404);
  assert.equal(fs.readdirSync(p).length, 0);
});
test('arquivo de cache corrompido: ignora o cache e baixa de novo', async () => {
  const p = pasta();
  await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: servidor([resp(200, 'OK', { etag: '"v1"' })]).fetchImpl });
  for (const f of fs.readdirSync(p)) if (f.endsWith('.json')) fs.writeFileSync(path.join(p, f), '{quebrado');
  const s = servidor([resp(200, 'OK2', { etag: '"v1"' })]);
  const r = await obterEstatico({ url: 'https://x/js/a.js', pastaCache: p, fetchImpl: s.fetchImpl });
  assert.equal(r.origem, 'baixado');
  assert.equal(s.chamadas[0].cond, null);
});
