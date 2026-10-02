// test/parse.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerPlanilha, parseRelatorio } from '../src/parse.js';
import { linha, planilha, CABECALHO } from './fixture.js';

const ler = (linhas) => parseRelatorio(lerPlanilha(planilha(linhas)));

test('linha atendida: campos convertidos (datas ISO -03:00, segundos, telefone só dígitos)', () => {
  const r = ler([linha()]);
  assert.equal(r.lidas, 1);
  assert.equal(r.invalidas, 0);
  assert.deepEqual(r.linhas[0], {
    id: 1001, usuario: 'apex.fulano', telefone: '11900000001', gerada_em: '2026-10-01T12:20:59-03:00',
    atendida: true, seg_falados: 75, tabulacao: 'RETORNO', transferido: null, gravacao: '2026/10/01/MANUAL-1001',
  });
});
test('FAILED não é atendida; tabulação "-" é mantida como vem', () => {
  const r = ler([linha({ ID: '1002', Status: 'FAILED', Tempo_Chamada: null, 'Última Tabulação': '-' })]);
  assert.equal(r.linhas[0].atendida, false);
  assert.equal(r.linhas[0].seg_falados, 0);
  assert.equal(r.linhas[0].tabulacao, '-');
});
test('telefone formatado vira só dígitos', () => {
  const r = ler([linha({ Telefone: '(11) 90000-0001' })]);
  assert.equal(r.linhas[0].telefone, '11900000001');
});
test('cabeçalho com UniqueID duplicado não atrapalha', () => {
  assert.equal(CABECALHO.filter((c) => c === 'UniqueID').length, 2);
  assert.equal(ler([linha()]).linhas.length, 1);
});
test('eagle.* e " EAGLE.x " ficam fora e são contados; apex.eagleton entra', () => {
  const r = ler([linha({ ID: '1', Usuario: 'eagle.juliana' }), linha({ ID: '2', Usuario: ' EAGLE.Maria ' }), linha({ ID: '3', Usuario: 'apex.eagleton' })]);
  assert.equal(r.ignoradasEagle, 2);
  assert.deepEqual(r.linhas.map((l) => l.id), [3]);
});
test('inválidas: ID vazio, ID não numérico, data fora do formato, usuário vazio', () => {
  const r = ler([
    linha({ ID: null }), linha({ ID: 'abc' }), linha({ ID: '5', DataHora_Geracao: '2026/10/01' }), linha({ ID: '6', Usuario: null }),
    linha({ ID: '7' }),
  ]);
  assert.equal(r.invalidas, 4);
  assert.deepEqual(r.linhas.map((l) => l.id), [7]);
});
test('ID repetido entra uma vez só', () => {
  const r = ler([linha({ ID: '9', Tempo_Chamada: '00:00:10' }), linha({ ID: '9', Tempo_Chamada: '00:09:59' })]);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].seg_falados, 10);
});
test('relatório só com cabeçalho: sem linhas, sem erro de colunas', () => {
  const r = ler([]);
  assert.deepEqual(r, { linhas: [], lidas: 0, invalidas: 0, ignoradasEagle: 0, faltando: [] });
});
test('coluna obrigatória ausente: devolve quais faltam e não lê linhas', () => {
  const sem = XLSX_sem_coluna('Telefone');
  const r = parseRelatorio(sem);
  assert.deepEqual(r.faltando, ['telefone']);
  assert.equal(r.linhas.length, 0);
});
test('cabeçalho sem acento/caixa/espaços é reconhecido', () => {
  const r = parseRelatorio([{ ' id ': '1', USUARIO: 'apex.a', 'Telefone ': '11900000001', 'STATUS': 'ANSWERED', 'datahora_geracao': '01/10/2026 08:00:00' }]);
  assert.equal(r.faltando.length, 0);
  assert.equal(r.linhas.length, 1);
});

function XLSX_sem_coluna(col) {
  const rows = lerPlanilha(planilha([linha()]));
  return rows.map((o) => { const c = { ...o }; delete c[col]; return c; });
}

// ---- correções da revisão final (02/10/2026) ----
import XLSX from 'xlsx';
function xlsxDe(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
test('telefone e ID guardados como NÚMERO na planilha não viram notação científica (igual ao upload manual: raw:true)', () => {
  const buf = xlsxDe([
    ['ID', 'Usuario', 'Telefone', 'Status', 'DataHora_Geracao', 'Tempo_Chamada'],
    [1001, 'apex.a', 5511987654321, 'ANSWERED', '01/10/2026 12:20:59', '00:01:15'],
  ]);
  const r = parseRelatorio(lerPlanilha(buf));
  assert.equal(r.faltando.length, 0);
  assert.equal(r.linhas[0].id, 1001);
  assert.equal(r.linhas[0].telefone, '5511987654321');
});
test('arquivo só com cabeçalho de OUTRO relatório: a coluna faltando é detectada mesmo sem linhas', () => {
  const r = parseRelatorio(lerPlanilha(xlsxDe([['Foo', 'Bar']])));
  assert.ok(r.faltando.length > 0);
});
test('arquivo totalmente vazio (sem cabeçalho) é erro de colunas, não sucesso', () => {
  const r = parseRelatorio(lerPlanilha(xlsxDe([[]])));
  assert.ok(r.faltando.length > 0);
});
