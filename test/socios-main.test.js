// test/socios-main.test.js — DADOS FICTÍCIOS (repo público)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executar, consultarUm } from '../src/socios/main.js';

const cartao = (n, cpf, pct) => `ZZ SOCIO ${n}\n${cpf}\nParticipação\n${pct}%\nParticipação em empresas`;
function navFalso(sobre = {}, nome = 'nav') {
  const reg = { pessoas: [], buscas: [], fechou: 0 };
  const nav = {
    nome,
    async buscarCnpj(c) { reg.buscas.push(c); },
    async abrirSocios() {},
    async lerCartoes() { return Array.from({ length: 7 }, (_, i) => cartao(i, '1234567890' + (i % 10), 10 + i)); },
    async lerPessoa(i) { reg.pessoas.push(i); return { fixos: null, celulares: `(11) 90000-000${i}\nWHATSAPP\nCLARO` }; },
    async fechar() { reg.fechou++; },
    ...sobre,
  };
  return { nav, reg };
}
function io(lotes, sobre = {}) {
  const reg = { enviados: [], logs: [], sessoes: 0, fechou: 0, novos: [] };
  let t = 0;
  const primeiro = navFalso(sobre.nav, 'nav-1');
  reg.primeiro = primeiro.reg;
  const o = {
    async pegar() { return lotes.shift() || []; },
    async enviar(c) { if (sobre.enviar) await sobre.enviar(c); reg.enviados.push(c); },
    async abrirSessao() {
      reg.sessoes++;
      if (sobre.loginFalha) throw new Error('login falhou para usuario-secreto');
      return {
        nav: primeiro.nav,
        async novoNav() { const n = navFalso({}, `nav-${reg.novos.length + 2}`); reg.novos.push(n.reg); return n.nav; },
        async fechar() { reg.fechou++; },
      };
    },
    agora: () => (t += 1000),
    log: (m) => reg.logs.push(m),
  };
  return { o, reg };
}
const cfg = { tetoRodadaMs: 7 * 60_000, tempoPorCnpjMs: 60_000, segredos: ['usuario-secreto', 'senha-secreta', 'EMPRESA'] };

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
test('consultarUm: página de Sócios aberta sem cartões → sem_socios', async () => {
  assert.equal((await consultarUm(navFalso({ async lerCartoes() { return ['texto sem cpf']; } }).nav, 'x')).status, 'sem_socios');
  assert.equal((await consultarUm(navFalso({ async lerCartoes() { return []; } }).nav, 'x')).status, 'sem_socios');
});
test('consultarUm: falha ao buscar o CNPJ ou abrir Sócios é erro (não vira sem_socios)', async () => {
  await assert.rejects(consultarUm(navFalso({ async buscarCnpj() { throw new Error('tempo esgotado na busca'); } }).nav, 'x'));
  await assert.rejects(consultarUm(navFalso({ async abrirSocios() { throw new Error('tempo esgotado em Sócios'); } }).nav, 'x'));
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
test('uma empresa estoura o tempo: só ela vira erro; a página velha é fechada e a próxima usa uma página NOVA', async () => {
  const lento = { async buscarCnpj() { await new Promise(() => {}); } };
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }, { id: 2, cnpj: '00000000000272' }], []], { nav: lento });
  const r = await executar({ ...cfg, tempoPorCnpjMs: 30 }, o);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'erro'], [2, 'pronto']]);
  assert.equal(r.erro, 1);
  assert.equal(reg.primeiro.fechou, 1, 'a página da consulta que estourou foi fechada');
  assert.equal(reg.novos.length, 1, 'abriu uma página nova');
  assert.deepEqual(reg.novos[0].buscas, ['00000000000272'], 'o CNPJ seguinte rodou na página nova');
});
test('erro do Playwright com o CNPJ na mensagem não vaza o CNPJ no log', async () => {
  const quebra = { async buscarCnpj(c) { throw new Error(`locator.pressSequentially: digitando "${c}"\nCall log: senha-secreta`); } };
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }], []], { nav: quebra });
  await executar(cfg, o);
  assert.deepEqual(reg.enviados[0], { id: 1, status: 'erro', erro: 'A consulta na Nova Vida falhou.' });
  assert.ok(reg.logs.every((l) => !l.includes('00000000000191') && !l.includes('senha-secreta')));
});
test('envio recusado (ex.: 400) não derruba a rodada: reenvia como erro e segue para o próximo', async () => {
  const enviar = async (c) => { if (c.id === 1 && c.status === 'pronto') throw new Error('ingest respondeu 400: resultado fora do formato'); };
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }, { id: 2, cnpj: '00000000000272' }], []], { enviar });
  const r = await executar(cfg, o);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'erro'], [2, 'pronto']]);
  assert.deepEqual([r.erro, r.pronto], [1, 1]);
});
test('teto da rodada: não pega lote novo depois de 7 min', async () => {
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }], [{ id: 2, cnpj: '00000000000272' }]]);
  o.agora = (() => { let t = 0; return () => (t += 3 * 60_000); })();
  await executar(cfg, o);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'pronto']]);
});
test('teto no meio do lote: os que sobraram viram erro sem consultar', async () => {
  const { o, reg } = io([[{ id: 1, cnpj: '00000000000191' }, { id: 2, cnpj: '00000000000272' }]]);
  o.agora = (() => { let t = 0; return () => (t += 3 * 60_000); })();
  const r = await executar(cfg, o);
  assert.deepEqual(reg.enviados.map((e) => [e.id, e.status]), [[1, 'pronto'], [2, 'erro']]);
  assert.equal(reg.enviados[1].erro, 'A consulta não terminou a tempo.');
  assert.deepEqual(reg.primeiro.buscas, ['00000000000191'], 'o 2º não foi consultado');
  assert.equal(r.erro, 1);
});
