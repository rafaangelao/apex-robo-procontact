// src/socios/main.js — rodada do robô de sócios (§156): pega a fila na ingest-socios, consulta a Nova Vida, devolve.
// Log público: só contagens. Disparado pelo workflow socios.yml (quem dispara é a RPC socios_pedir).
import { pathToFileURL } from 'node:url';
import { chamar } from '../enviar.js';
import { limparErro } from '../erro.js';
import { lerCartaoSocio, ordenarSocios, lerTelefones, paraResultado, TETO_TELEFONES } from './ler-socios.js';

const ERRO_LOGIN = 'Falha no login da Nova Vida.';
const ERRO_CONSULTA = 'A consulta na Nova Vida falhou.';

export async function consultarUm(nav, cnpj) {
  if (!(await nav.buscarCnpj(cnpj))) return { status: 'sem_socios' };
  if (!(await nav.abrirSocios())) return { status: 'sem_socios' };
  const socios = ordenarSocios((await nav.lerCartoes()).map((t, i) => lerCartaoSocio(t, i)).filter(Boolean));
  if (!socios.length) return { status: 'sem_socios' };
  for (const s of socios.slice(0, TETO_TELEFONES)) {
    const p = await nav.lerPessoa(s.indice);
    s.telefones = [...lerTelefones(p.fixos, 'fixo'), ...lerTelefones(p.celulares, 'celular')];
    s.telefones_consultados = true;
  }
  return { status: 'pronto', resultado: { socios: socios.map(paraResultado) } };
}

function comTempo(promessa, ms) {
  let timer;
  const limite = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('tempo esgotado')), ms); });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

export async function executar(cfg, io) {
  const t0 = io.agora();
  const cont = { pedidos: 0, pronto: 0, sem_socios: 0, erro: 0 };
  let sessao = null;
  let codigo = 0;
  try {
    while (io.agora() - t0 < cfg.tetoRodadaMs) {
      const lote = await io.pegar(10);
      if (!lote.length) break;
      cont.pedidos += lote.length;
      if (!sessao) {
        try { sessao = await io.abrirSessao(); } catch (e) {
          io.log('socios: falha no login: ' + limparErro(e, cfg.segredos));
          for (const p of lote) await io.enviar({ id: p.id, status: 'erro', erro: ERRO_LOGIN });
          cont.erro += lote.length;
          codigo = 1;
          break;
        }
      }
      for (const p of lote) {
        let r;
        try {
          r = await comTempo(consultarUm(sessao.nav, p.cnpj), cfg.tempoPorCnpjMs);
        } catch (e) {
          io.log('socios: uma consulta falhou: ' + limparErro(e, [...cfg.segredos, p.cnpj]));
          r = { status: 'erro', erro: ERRO_CONSULTA };
          await sessao.nav.reiniciar().catch(() => {});
        }
        await io.enviar({ id: p.id, ...r });
        cont[r.status]++;
      }
    }
  } finally {
    if (sessao) await sessao.fechar().catch(() => {});
  }
  io.log(`socios: ${cont.pedidos} pedidos · ${cont.pronto} prontos · ${cont.sem_socios} sem sócios · ${cont.erro} erros · ${Math.round((io.agora() - t0) / 1000)} s`);
  return { codigo, ...cont };
}

function env(k) {
  const v = process.env[k];
  if (!v) throw new Error(`variável de ambiente ausente: ${k}`);
  return v;
}

async function main() {
  const { chromium } = await import('playwright'); // import tardio: os testes não precisam do Playwright
  const { criarNavegador } = await import('./novavida.js');
  const cred = { usuario: env('NOVAVIDA_USUARIO'), senha: env('NOVAVIDA_SENHA'), cliente: env('NOVAVIDA_EMPRESA') };
  const ingest = { url: env('INGEST_SOCIOS_URL'), token: env('INGEST_SOCIOS_TOKEN') };
  const cfg = { tetoRodadaMs: 8 * 60_000, tempoPorCnpjMs: 60_000, segredos: [cred.usuario, cred.senha, cred.cliente, ingest.token] };
  const io = {
    pegar: async (max) => ((await chamar({ ...ingest, corpo: { acao: 'pegar', max } })).pedidos || []),
    enviar: (corpo) => chamar({ ...ingest, corpo: { acao: 'resultado', ...corpo } }),
    async abrirSessao() {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
        const nav = await criarNavegador(context);
        await nav.entrar(cred);
        return { nav, fechar: () => browser.close() };
      } catch (e) { await browser.close().catch(() => {}); throw e; }
    },
    agora: () => Date.now(),
    log: (m) => console.log(m),
  };
  const r = await executar(cfg, io);
  process.exit(r.codigo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + String((e && e.message) || e).slice(0, 300)); process.exit(1); });
}
