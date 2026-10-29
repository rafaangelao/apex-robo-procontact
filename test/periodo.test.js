// test/periodo.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoDoRelatorio, formatarTela, paraIso } from '../src/periodo.js';

test('meio do mês: do dia 1 deste mês até hoje 23:59', () => {
  const p = periodoDoRelatorio(new Date('2026-10-15T15:00:00Z'));
  assert.equal(formatarTela(p), '01/10/2026 00:00 - 15/10/2026 23:59');
});
test('dias 1 e 2: começa no mês anterior', () => {
  assert.equal(formatarTela(periodoDoRelatorio(new Date('2026-10-01T15:00:00Z'))), '01/09/2026 00:00 - 01/10/2026 23:59');
  assert.equal(formatarTela(periodoDoRelatorio(new Date('2026-10-02T15:00:00Z'))), '01/09/2026 00:00 - 02/10/2026 23:59');
});
test('dia 3 já começa no mês corrente', () => {
  assert.equal(formatarTela(periodoDoRelatorio(new Date('2026-10-03T15:00:00Z'))), '01/10/2026 00:00 - 03/10/2026 23:59');
});
test('janeiro: o mês anterior é dezembro do ano anterior', () => {
  assert.equal(formatarTela(periodoDoRelatorio(new Date('2026-01-01T15:00:00Z'))), '01/12/2025 00:00 - 01/01/2026 23:59');
});
test('23:00 do dia 30 em São Paulo ainda é dia 30 (não vira dia 1 pelo UTC)', () => {
  assert.equal(formatarTela(periodoDoRelatorio(new Date('2026-10-01T02:00:00Z'))), '01/09/2026 00:00 - 30/09/2026 23:59');
});
test('paraIso usa -03:00 e aceita segundos', () => {
  const p = periodoDoRelatorio(new Date('2026-10-15T15:00:00Z'));
  assert.equal(paraIso(p.inicio), '2026-10-01T00:00:00-03:00');
  assert.equal(paraIso(p.fim, '59'), '2026-10-15T23:59:59-03:00');
});

// ---- rodada rápida das chamadas manuais (28/10/2026): só o dia de hoje ----
test('periodoHoje: hoje 00:00 até hoje 23:59 (São Paulo), inclusive no dia 1', async () => {
  const { periodoHoje } = await import('../src/periodo.js');
  assert.equal(formatarTela(periodoHoje(new Date('2026-10-15T15:00:00Z'))), '15/10/2026 00:00 - 15/10/2026 23:59');
  assert.equal(formatarTela(periodoHoje(new Date('2026-10-01T15:00:00Z'))), '01/10/2026 00:00 - 01/10/2026 23:59');
  assert.equal(formatarTela(periodoHoje(new Date('2026-10-01T02:00:00Z'))), '30/09/2026 00:00 - 30/09/2026 23:59');
});
