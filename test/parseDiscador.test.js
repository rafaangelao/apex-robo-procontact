import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerPlanilha } from '../src/parse.js';
import { parseDiscador, normExata } from '../src/parseDiscador.js';
import { linhaDiscador, planilhaDiscador, COL } from './fixtureDiscador.js';

const ler = (linhas) => parseDiscador(lerPlanilha(planilhaDiscador(linhas)));

test('normExata separa DataHora_Fim de Data/Hora Fim e Tempo_Total de Tempo Total', () => {
  assert.equal(normExata('DataHora_Fim'), 'datahora_fim');
  assert.equal(normExata('Data/Hora Fim'), 'datahorafim');
  assert.equal(normExata('Tempo_Total'), 'tempo_total');
  assert.equal(normExata('Tempo Total'), 'tempototal');
  assert.equal(normExata('Última Tabulação'), 'ultimatabulacao');
});
test('linha atendida: colunas de SP, segundos, CNPJ com 14 dígitos, região da 2ª coluna', () => {
  const r = ler([linhaDiscador()]);
  assert.equal(r.lidas, 1);
  assert.equal(r.invalidas, 0);
  assert.deepEqual(r.linhas[0], {
    id: 244000001, gerada_em: '2026-10-02T15:14:20-03:00', conectada_em: '2026-10-02T15:14:30-03:00',
    atendida_em: '2026-10-02T15:14:32-03:00', fim_em: '2026-10-02T15:16:00-03:00', status: 'ANSWERED', agente_id: 189,
    seg_espera: 2, seg_falados: 88, seg_total: 100, tabulacao: 'SEM AVANÇO', carga_id: 14162, carga: 'ZZ-CARGA',
    campanha: 'ZZ-CAMPANHA', cnpj: '00000000000101', telefone: '11900000001', operadora_base: 'ZZ-OPERADORA',
    cidade: 'ZZCIDADE', regiao: 'SUDESTE', gravacao: '1003/2026/10/02/DIALER-1',
  });
});
test('nome e CPF nunca saem do leitor', () => {
  const l = ler([linhaDiscador()]).linhas[0];
  const s = JSON.stringify(l);
  assert.equal(s.includes('FULANO'), false);
  assert.equal(s.includes('11122233344'), false);
});
test('chamada não atendida: agente, tempos e tabulação vazios viram null', () => {
  const r = ler([linhaDiscador({
    [COL['Status']]: 'BUSY', [COL['ID do Usuário']]: null, [COL['Tempo_Espera']]: null, [COL['Tempo_Chamada']]: null,
    [COL['DataHora_Conectado']]: null, [COL['DataHora_Atendimento']]: null, [COL['Última Tabulação']]: null,
  })]);
  const l = r.linhas[0];
  assert.equal(l.status, 'BUSY');
  assert.equal(l.agente_id, null);
  assert.equal(l.seg_falados, null);
  assert.equal(l.seg_espera, null);
  assert.equal(l.tabulacao, null);
  assert.equal(l.conectada_em, null);
});
test('linha de rodapé (tem ID, sem Status) é inválida e não entra', () => {
  const rodape = Array(50).fill(null);
  rodape[COL['ID']] = 244000099;
  const r = ler([linhaDiscador(), rodape]);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.invalidas, 1);
});
test('id repetido entra uma vez; ID inválido é contado', () => {
  const r = ler([linhaDiscador(), linhaDiscador(), linhaDiscador({ [COL['ID']]: 'abc' })]);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.invalidas, 1);
});
test('CNPJ como texto pontuado também vira 14 dígitos; telefone formatado vira só dígitos', () => {
  const l = ler([linhaDiscador({ [COL['Documento 2']]: '00.000.000/0001-01', [COL['Telefone']]: '(11) 90000-0001' })]).linhas[0];
  assert.equal(l.cnpj, '00000000000101');
  assert.equal(l.telefone, '11900000001');
});
test('outro relatório (sem DataHora_Geracao) → faltando = [gerada] e nenhuma linha', () => {
  const r = parseDiscador(Object.assign([{ ID: 1, Status: 'ANSWERED' }], { cabecalho: ['ID', 'Status'] }));
  assert.deepEqual(r.faltando, ['gerada']);
  assert.equal(r.lidas, 0);
  assert.equal(r.linhas.length, 0);
});
test('planilha vazia com cabeçalho certo → 0 linhas, sem faltando', () => {
  const r = ler([]);
  assert.deepEqual(r, { linhas: [], lidas: 0, invalidas: 0, faltando: [] });
});
