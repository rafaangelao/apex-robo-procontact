// test/expediente.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partesSP, dentroDoExpediente } from '../src/expediente.js';

// 02/10/2026 é sexta; 03 sábado; 04 domingo. São Paulo = UTC-3.
test('partesSP converte para o horário de São Paulo', () => {
  const p = partesSP(new Date('2026-10-01T02:00:00Z')); // 30/09 23:00 em SP
  assert.deepEqual(p, { y: 2026, m: 9, d: 30, dia: 3, hora: 23, min: 0 });
});

test('dentro do expediente: sexta 10:00 SP e sexta 07:00 SP', () => {
  assert.equal(dentroDoExpediente(new Date('2026-10-02T13:00:00Z')), true);
  assert.equal(dentroDoExpediente(new Date('2026-10-02T10:00:00Z')), true);
});
test('fora: 06:59 SP, 22:00 SP e 23:00 SP', () => {
  assert.equal(dentroDoExpediente(new Date('2026-10-02T09:59:00Z')), false);
  assert.equal(dentroDoExpediente(new Date('2026-10-03T01:00:00Z')), false); // sex 22:00 SP
  assert.equal(dentroDoExpediente(new Date('2026-10-03T02:00:00Z')), false); // sex 23:00 SP
});
test('21:59 SP ainda é expediente', () => {
  assert.equal(dentroDoExpediente(new Date('2026-10-03T00:59:00Z')), true);
});
test('sábado dentro do horário conta; domingo nunca', () => {
  assert.equal(dentroDoExpediente(new Date('2026-10-03T15:00:00Z')), true);  // sáb 12:00 SP
  assert.equal(dentroDoExpediente(new Date('2026-10-04T15:00:00Z')), false); // dom 12:00 SP
});
test('domingo 00:30 SP (03:30Z) é domingo; sábado 23:30 SP (02:30Z de domingo) é sábado fora do horário', () => {
  assert.equal(partesSP(new Date('2026-10-04T03:30:00Z')).dia, 0);
  assert.equal(partesSP(new Date('2026-10-04T02:30:00Z')).dia, 6);
  assert.equal(dentroDoExpediente(new Date('2026-10-04T02:30:00Z')), false);
});
