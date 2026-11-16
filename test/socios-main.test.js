// test/socios-main.test.js — DADOS FICTÍCIOS (repo público)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executar, consultarUm } from '../src/socios/main.js';

const cartao = (n, cpf, pct) => `ZZ SOCIO ${n}\n${cpf}\nParticipação\n${pct}%\nParticipação em empresas`;
function navFalso(sobre = {}) {
  const reg = { pessoas: [], reiniciou: 0 };
  const nav = {
    async buscarCnpj() { return true; },
    async abrirSocios() { return true; },
    async lerCartoes() { return Array.from({ length: 7 }, (_, i) => cartao(i, '1234567890' + (i % 10), 10 + i)); },
    async lerPessoa(i) { reg.pessoas.push(i); return { fixos: null, celulares: `(11) 90000-000${i}\nWHATSAPP\nCLARO` }; },
    async reiniciar() { reg.reiniciou++; },
    ...sobre,
  };
  return { nav, reg };
}
function io(lotes, sobre = {}) {
  const reg = { enviados: [], logs: [], sessoes: 0, fechou: 0 };
  let t = 0;
  const { nav } = navFalso(sobre.nav);
  const o = {
    async pegar() { return lotes.shift() || []; },
    async enviar(c) { reg.enviados.push(c); },
    async abrirSessao() { reg.sessoes++; if (sobre.loginFalha) throw new Error('login falhou para usuario-secreto'); return { nav, async fechar() { reg.fechou++; } }; },
    agora: () => (t += 1000),
    log: (m) => reg.logs.push(m),
  };
  return { o, reg };
}
const cfg = { tetoRodadaMs: 8 * 60_000, tempoPorCnpjMs: 60_000, segredos: ['usuario-secreto', 'senha-secreta', 'EMPRESA'] };

test('consultarUm: abre telefones só dos 5 de maior participação; demais sem telefone', async () => {
  const { nav, reg } = navFalso();
  const r = await consultarUm(nav, '00000000000191');
  assert.equal(r.status, 'pronto');
  assert.equal(r.resultado.socios.length, 7);
  assert.deepEqual(reg.pessoas, [6, 5, 4, 3, 2]);
  assert.deepEqual(r.resultado.socios.map((s) => s.telefones_consultados), [true, true, true, true, true, false, false]);
  assert.deepEqual(r.resultado.socios[0].telefones, [{ tipo: 'celular', numero: '11900000006', operadora: 'CLARO', whatsapp: true }]);
  assert.equal('indice' in r.resultado.socios[0], false);
});
test('consultarUm: CNPJ não achado, Sócios não abre ou sem cartões → sem_socios', async () => {
  assert.equal((await consultarUm(navFalso({ async buscarCnpj() { return false; } }).nav, 'x')).status, 'sem_socios');
  assert.equal((await consultarUm(navFalso({ async abrirSocios() { return false; } }).nav, 'x')).status, 'sem_socios');
  assert.equal((await consultarUm(navFalso({ async lerCartoes() { return ['texto sem cpf']; } }).nav, 'x')).status, 'sem_socios');
});
test('fila vazia: não abre o navegador (sem login)', async () => {
  const { o, reg } = io([[]]);
  const r = await executar(cfg, o);
  assert.equal(r.codigo, 0);
  assert.equal(reg.sessoes, 0);
  assert.match(reg.logs.at(-1), /^socios: 0 pedidos · 0 prontos · 0 sem sócios · 0 erros · \d+ s$/);
});
test('um login para vários lotes; pega de novo até esvaziar; fecha o navegador', async () => {
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }], [{ id: 2, cnpj: '00000000000272' }], []]);
  const r = await executar(cfg, o);
  assert.deepEqual([r.pedidos, r.pronto, reg.sessoes, reg.fechou], [2, 2, 1, 1]);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'pronto'], [2, 'pronto']]);
});
test('login falha: todos os pedidos do lote viram erro, código 1, log sem segredo', async () => {
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }, { id: 2, cnpj: '00000000000272' }]], { loginFalha: true });
  const r = await executar(cfg, o);
  assert.equal(r.codigo, 1);
  assert.deepEqual(reg.enviados, [
    { id: 1, status: 'erro', erro: 'Falha no login da Nova Vida.' }, { id: 2, status: 'erro', erro: 'Falha no login da Nova Vida.' },
  ]);
  assert.ok(reg.logs.every((l) => !l.includes('usuario-secreto')));
});
test('uma empresa estoura o tempo: só ela vira erro, a página é reiniciada e a próxima segue', async () => {
  let n = 0;
  const lento = { async buscarCnpj() { n++; if (n === 1) await new Promise(() => {}); return true; } };
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }, { id: 2, cnpj: '00000000000272' }], []], { nav: lento });
  const r = await executar({ ...cfg, tempoPorCnpjMs: 30 }, o);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'erro'], [2, 'pronto']]);
  assert.equal(r.erro, 1);
});
test('erro do Playwright com o CNPJ na mensagem não vaza o CNPJ no log', async () => {
  const quebra = { async buscarCnpj(c) { throw new Error(`locator.pressSequentially: digitando "${c}"\nCall log: senha-secreta`); } };
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }], []], { nav: quebra });
  await executar(cfg, o);
  assert.deepEqual(reg.enviados[0], { id: 1, status: 'erro', erro: 'A consulta na Nova Vida falhou.' });
  assert.ok(reg.logs.every((l) => !l.includes('00000000000191') && !l.includes('senha-secreta')));
});
test('teto da rodada: não pega lote novo depois de 8 min', async () => {
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }], [{ id: 2, cnpj: '00000000000272' }]]);
  o.agora = (() => { let t = 0; return () => (t += 5 * 60_000); })();
  await executar(cfg, o);
  assert.deepEqual(reg.enviados.map((e) => e.id), [1]);
});
