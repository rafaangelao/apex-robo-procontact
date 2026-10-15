// test/discador.test.js — fluxo do relatório do DISCADOR (REGRAS §87/§89): período, campanhas e execução.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoDiscador, formatarTela } from '../src/periodo.js';
import { campanhaEscolhida, prefixosCampanhas, executarDiscador } from '../src/discador.js';
import XLSX from 'xlsx';
import { linhaDiscador, planilhaDiscador, COL } from './fixtureDiscador.js';

const QUINTA_15H = new Date('2026-10-15T18:00:00Z');

test('periodoDiscador: ontem 00:00 até hoje 23:59 (São Paulo)', () => {
  assert.equal(formatarTela(periodoDiscador(QUINTA_15H)), '14/10/2026 00:00 - 15/10/2026 23:59');
});
test('periodoDiscador: dia 1 começa no último dia do mês anterior', () => {
  assert.equal(formatarTela(periodoDiscador(new Date('2026-10-01T13:00:00Z'))), '30/09/2026 00:00 - 01/10/2026 23:59');
  assert.equal(formatarTela(periodoDiscador(new Date('2027-01-01T13:00:00Z'))), '31/12/2026 00:00 - 01/01/2027 23:59');
});

test('prefixosCampanhas: padrão Apex + Campinas; lista da variável sem espaços vazios', () => {
  assert.deepEqual(prefixosCampanhas(undefined), ['DISCADOR-APEX-', 'MIGRACAO-CLARO']);
  assert.deepEqual(prefixosCampanhas(' A , ,B '), ['A', 'B']);
});
test('campanhaEscolhida: pelo começo do nome, sem caixa e sem acento, ignorando o ícone do item', () => {
  const p = ['DISCADOR-APEX-', 'MIGRACAO-CLARO'];
  assert.equal(campanhaEscolhida('check_circle DISCADOR-APEX-AQUISICAO-CLARO-ABORDAGEM-SETEMBRO-2026', p), true);
  assert.equal(campanhaEscolhida('check_circle MIGRACAO-CLARO-OUTUBRO', p), true);
  assert.equal(campanhaEscolhida('Migração-Claro-Novembro', p), true);
  assert.equal(campanhaEscolhida('check_circle DISCADOR-AQUISICAO-CLARO-ABORDAGEM-AGOSTO-2026', p), false);
  assert.equal(campanhaEscolhida('check_circle DISCADOR-EAGLE-AQUISICAO-TIM-ABORDAGEM-SETEMBRO-2026', p), false);
  assert.equal(campanhaEscolhida('Buscar... Ctrl K', p), false);
});

const cfg = (sobre = {}) => ({ procontactUrl: 'https://pc', usuario: 'u', senha: 's', discadorUrl: 'https://ing-d', discadorToken: 'td', modo: 'real', agora: QUINTA_15H, campanhas: 'DISCADOR-APEX-,MIGRACAO-CLARO', ...sobre });
function io(sobre = {}) {
  const reg = { exportar: [], chamar: [], lotes: [], limpar: [], logs: [] };
  const rodape = Array(50).fill(null); rodape[COL['ID']] = 999;
  const buf = planilhaDiscador([linhaDiscador(), linhaDiscador({ [COL['ID']]: 244000002, [COL['Status']]: 'BUSY' }), rodape]);
  const o = {
    async exportarDiscador(a) { reg.exportar.push(a); return '/tmp/d/relatorio'; },
    ler: () => buf,
    async chamar(a) { reg.chamar.push(a); return a.corpo.acao === 'contar' ? { total: 7 } : { ok: true }; },
    async enviarLotes(a) { reg.lotes.push(a); return { gravadas: a.linhas.length }; },
    uuid: () => '123e4567-e89b-42d3-a456-426614174999',
    pastaTemporaria: () => '/tmp/d',
    limpar: (p) => reg.limpar.push(p),
    log: (m) => reg.logs.push(m),
    ...sobre,
  };
  return { o, reg };
}

test('executarDiscador real: exporta ontem+hoje com as campanhas, envia à ingest-discador e grava o final', async () => {
  const { o, reg } = io();
  const r = await executarDiscador(cfg(), o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.exportar[0].textoPeriodo, '14/10/2026 00:00 - 15/10/2026 23:59');
  assert.deepEqual(reg.exportar[0].campanhas, ['DISCADOR-APEX-', 'MIGRACAO-CLARO']);
  assert.equal(reg.lotes[0].url, 'https://ing-d');
  assert.equal(reg.lotes[0].token, 'td');
  assert.equal(reg.lotes[0].linhas.length, 2);
  assert.equal('nome' in reg.lotes[0].linhas[0], false);
  const fim = reg.chamar.at(-1);
  assert.equal(fim.url, 'https://ing-d');
  assert.deepEqual([fim.corpo.acao, fim.corpo.ok, fim.corpo.lidas, fim.corpo.enviadas, fim.corpo.invalidas], ['final', true, 3, 2, 1]);
  assert.equal(fim.corpo.periodo_de, '2026-10-14T00:00:00-03:00');
  assert.equal(fim.corpo.periodo_ate, '2026-10-15T23:59:59-03:00');
  assert.equal('ignoradas_eagle' in fim.corpo, false);
  assert.deepEqual(reg.limpar, ['/tmp/d']);
});
test('executarDiscador dry: só confere a contagem, não grava nem registra final', async () => {
  const { o, reg } = io();
  const r = await executarDiscador(cfg({ modo: 'dry' }), o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.lotes.length, 0);
  assert.deepEqual(reg.chamar.map((c) => c.corpo.acao), ['contar']);
  assert.ok(reg.logs.some((l) => /2 chamadas válidas/.test(l) && /7/.test(l)));
});
test('executarDiscador: erro vira final ok=false sem segredo na mensagem, e limpa a pasta', async () => {
  const { o, reg } = io({ async exportarDiscador() { throw new Error('falhou com segredo e tok123\n  Call log: digitou segredo'); } });
  const r = await executarDiscador(cfg({ senha: 'segredo', discadorToken: 'tok123' }), o);
  assert.equal(r.codigo, 1);
  const fim = reg.chamar.at(-1).corpo;
  assert.equal(fim.acao, 'final');
  assert.equal(fim.ok, false);
  assert.equal(/segredo|tok123|Call log/.test(fim.erro), false);
  assert.deepEqual(reg.limpar, ['/tmp/d']);
});
test('executarDiscador: relatório de outro formato é erro (não "0 linhas")', async () => {
  const ws = XLSX.utils.aoa_to_sheet([['ID', 'Status'], [1, 'ANSWERED']]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'x');
  const { o, reg } = io({ ler: () => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) });
  const r = await executarDiscador(cfg(), o);
  assert.equal(r.codigo, 1);
  assert.match(reg.chamar.at(-1).corpo.erro, /colunas/);
});
