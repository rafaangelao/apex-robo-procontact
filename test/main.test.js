// test/main.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { executar } from '../src/main.js';
import { lerPlanilha } from '../src/parse.js';
import { linha, planilha } from './fixture.js';

const SEXTA_10H = new Date('2026-10-02T13:00:00Z');
const DOMINGO = new Date('2026-10-04T15:00:00Z');
const cfg = (sobre = {}) => ({ procontactUrl: 'https://pc', usuario: 'u', senha: 's', ingestUrl: 'https://ing', token: 't', modo: 'real', forcar: false, agora: SEXTA_10H, ...sobre });

function io(sobre = {}) {
  const reg = { exportar: [], chamar: [], lotes: [], limpar: [], logs: [] };
  const buf = planilha([linha({ ID: '1' }), linha({ ID: '2', Status: 'FAILED' }), linha({ ID: '3', Usuario: 'eagle.x' }), linha({ ID: null })]);
  const o = {
    async exportar(a) { reg.exportar.push(a); return '/tmp/x/relatorio.xlsx'; },
    ler: () => buf,
    async chamar(a) { reg.chamar.push(a.corpo); return a.corpo.acao === 'contar' ? { total: 2 } : { ok: true }; },
    async enviarLotes(a) { reg.lotes.push(a); return { gravadas: a.linhas.length }; },
    uuid: () => '123e4567-e89b-42d3-a456-426614174000',
    pastaTemporaria: () => '/tmp/x',
    limpar: (p) => reg.limpar.push(p),
    log: (m) => reg.logs.push(m),
    ...sobre,
  };
  return { o, reg };
}

test('fora do expediente (domingo): não acessa o ProContact e sai 0', async () => {
  const { o, reg } = io();
  const r = await executar(cfg({ agora: DOMINGO }), o);
  assert.equal(r.codigo, 0);
  assert.equal(r.pulou, true);
  assert.equal(reg.exportar.length, 0);
});
test('forçar (execução manual) ignora o expediente', async () => {
  const { o, reg } = io();
  const r = await executar(cfg({ agora: DOMINGO, forcar: true }), o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.exportar.length, 1);
});
test('real: exporta o período certo, envia as linhas válidas e registra o final ok', async () => {
  const { o, reg } = io();
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.exportar[0].textoPeriodo, '01/09/2026 00:00 - 02/10/2026 23:59');
  assert.equal(reg.lotes[0].linhas.length, 2);
  const fim = reg.chamar.at(-1);
  assert.equal(fim.acao, 'final');
  assert.equal(fim.ok, true);
  assert.equal(fim.lidas, 4);
  assert.equal(fim.enviadas, 2);
  assert.equal(fim.invalidas, 1);
  assert.equal(fim.ignoradas_eagle, 1);
  assert.equal(fim.execucao_id, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(fim.periodo_de, '2026-09-01T00:00:00-03:00');
  assert.equal(fim.periodo_ate, '2026-10-02T23:59:59-03:00');
  assert.deepEqual(reg.limpar, ['/tmp/x']);
});
test('dry: confere com o banco, não envia lotes e não registra final', async () => {
  const { o, reg } = io();
  const r = await executar(cfg({ modo: 'dry' }), o);
  assert.equal(r.codigo, 0);
  assert.equal(r.dry, true);
  assert.equal(r.validas, 2);
  assert.equal(r.noBanco, 2);
  assert.equal(reg.lotes.length, 0);
  assert.deepEqual(reg.chamar.map((c) => c.acao), ['contar']);
});
test('relatório vazio: sucesso com 0 linhas, nada enviado, final ok', async () => {
  const { o, reg } = io({ ler: () => planilha([]) });
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.lotes.length === 0 || reg.lotes[0].linhas.length === 0, true);
  assert.equal(reg.chamar.at(-1).ok, true);
  assert.equal(reg.chamar.at(-1).lidas, 0);
});
test('exportação falha: registra ok=false com a mensagem, sai 1 e limpa a pasta', async () => {
  const { o, reg } = io({ async exportar() { throw new Error('login recusado'); } });
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 1);
  const fim = reg.chamar.at(-1);
  assert.equal(fim.acao, 'final');
  assert.equal(fim.ok, false);
  assert.equal(fim.erro, 'login recusado');
  assert.deepEqual(reg.limpar, ['/tmp/x']);
});
test('relatório sem coluna obrigatória: erro claro, ok=false, código 1', async () => {
  const { o, reg } = io({ ler: () => semTelefone() });
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 1);
  assert.match(reg.chamar.at(-1).erro, /colunas.*telefone/);
});
test('função falha no meio do envio: ok=false e código 1', async () => {
  const { o, reg } = io({ async enviarLotes() { throw new Error('ingest respondeu 500: erro interno'); } });
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 1);
  assert.equal(reg.chamar.at(-1).ok, false);
  assert.match(reg.chamar.at(-1).erro, /500/);
});
test('falha ao registrar o erro não esconde o erro original (continua código 1)', async () => {
  const { o, reg } = io({
    async exportar() { throw new Error('tela mudou'); },
    async chamar() { throw new Error('ingest respondeu 401'); },
  });
  const r = await executar(cfg(), o);
  assert.equal(r.codigo, 1);
  assert.ok(reg.logs.some((m) => m.includes('tela mudou')));
});
test('mensagens de log não contêm telefone nem usuário da telefonia', async () => {
  const { o, reg } = io();
  await executar(cfg(), o);
  const tudo = reg.logs.join('\n');
  assert.ok(!tudo.includes('11900000001'));
  assert.ok(!tudo.includes('apex.fulano'));
});

function semTelefone() {
  const rows = lerPlanilha(planilha([linha()])).map((o) => { const c = { ...o }; delete c.Telefone; return c; });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
