// test/enviar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamar, enviarLotes } from '../src/enviar.js';

function falso(respostas) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    const r = respostas.shift() ?? { status: 200, json: { gravadas: 0 } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { fetchImpl, chamadas };
}
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, usuario: 'apex.a', telefone: '11900000001', gerada_em: '2026-10-01T10:00:00-03:00', atendida: true, seg_falados: 5, tabulacao: null, transferido: null, gravacao: null }));

test('chamar: envia POST JSON com o token no header', async () => {
  const { fetchImpl, chamadas } = falso([{ status: 200, json: { total: 7 } }]);
  const r = await chamar({ url: 'https://x/ingest', token: 'T0K', corpo: { acao: 'contar' }, fetchImpl });
  assert.deepEqual(r, { total: 7 });
  assert.equal(chamadas[0].init.method, 'POST');
  assert.equal(chamadas[0].init.headers['x-robo-token'], 'T0K');
  assert.equal(chamadas[0].init.headers['content-type'], 'application/json');
});
test('chamar: erro HTTP lança com o status e sem eco do corpo enviado', async () => {
  const { fetchImpl } = falso([{ status: 500, json: { error: 'erro interno' } }]);
  await assert.rejects(
    chamar({ url: 'https://x', token: 't', corpo: { acao: 'lote', lote: [{ telefone: '11900000001' }] }, fetchImpl }),
    (e) => /500/.test(e.message) && /erro interno/.test(e.message) && !e.message.includes('11900000001'),
  );
});
test('chamar: resposta sem JSON ainda lança com o status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new Error('x'); } });
  await assert.rejects(chamar({ url: 'https://x', token: 't', corpo: {}, fetchImpl }), /502/);
});
test('enviarLotes: 1203 linhas → 3 lotes (500, 500, 203) e soma das gravadas', async () => {
  const { fetchImpl, chamadas } = falso([{ status: 200, json: { gravadas: 500 } }, { status: 200, json: { gravadas: 500 } }, { status: 200, json: { gravadas: 203 } }]);
  const r = await enviarLotes({ url: 'https://x', token: 't', linhas: mk(1203), execucaoId: 'e1', fetchImpl });
  assert.equal(r.gravadas, 1203);
  assert.deepEqual(chamadas.map((c) => c.corpo.lote.length), [500, 500, 203]);
  assert.ok(chamadas.every((c) => c.corpo.acao === 'lote' && c.corpo.execucao_id === 'e1'));
});
test('enviarLotes: sem linhas não chama a função', async () => {
  const { fetchImpl, chamadas } = falso([]);
  const r = await enviarLotes({ url: 'https://x', token: 't', linhas: [], execucaoId: 'e', fetchImpl });
  assert.equal(r.gravadas, 0);
  assert.equal(chamadas.length, 0);
});
test('enviarLotes: para no primeiro erro, sem retentativa e sem mandar os lotes seguintes', async () => {
  const { fetchImpl, chamadas } = falso([{ status: 200, json: { gravadas: 500 } }, { status: 500, json: { error: 'erro interno' } }]);
  await assert.rejects(enviarLotes({ url: 'https://x', token: 't', linhas: mk(1500), execucaoId: 'e', fetchImpl }), /500/);
  assert.equal(chamadas.length, 2);
});
