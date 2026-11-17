// src/socios/main.js — rodada do robô de sócios (§156): pega a fila na ingest-socios, consulta a Nova Vida, devolve.
// Log público: só contagens. Disparado pelo workflow socios.yml (quem dispara é a RPC socios_pedir).
import { pathToFileURL } from 'node:url';
import { chamar } from '../enviar.js';
import { limparErro } from '../erro.js';
import { lerCartaoSocio, ordenarSocios, lerTelefones, paraResultado, TETO_TELEFONES } from './ler-socios.js';

const ERRO_LOGIN = 'Falha no login da Nova Vida.';
const ERRO_CONSULTA = 'A consulta na Nova Vida falhou.';
const ERRO_TEMPO = 'A consulta não terminou a tempo.';

// Falha de navegação lança (vira erro); "sem_socios" só quando a página de Sócios abriu e não tem cartão.
export async function consultarUm(nav, cnpj) {
  await nav.buscarCnpj(cnpj);
  await nav.abrirSocios();
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

// Envia o resultado de um pedido sem derrubar a rodada: se a Edge recusar (400/409/rede), tenta gravar como erro.
// Devolve o status que valeu para a contagem.
async function enviarSeguro(io, cfg, corpo, cnpj) {
  try { await io.enviar(corpo); return corpo.status; } catch (e) {
    io.log('socios: envio recusado: ' + limparErro(e, [...cfg.segredos, cnpj]));
    if (corpo.status !== 'erro') {
      try { await io.enviar({ id: corpo.id, status: 'erro', erro: ERRO_CONSULTA }); } catch (e2) {
        io.log('socios: envio do erro também falhou: ' + limparErro(e2, [...cfg.segredos, cnpj]));
      }
    }
    return 'erro';
  }
}

// Depois de um tempo esgotado: fecha a página da consulta velha (que pode seguir rodando) e abre outra na mesma sessão.
async function trocarNavegador(io, cfg, sessao) {
  const velho = sessao.nav;
  sessao.nav = null;
  await velho.fechar().catch(() => {});
  try { sessao.nav = await sessao.novoNav(); } catch (e) { io.log('socios: não abriu página nova: ' + limparErro(e, cfg.segredos)); }
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
          for (const p of lote) await enviarSeguro(io, cfg, { id: p.id, status: 'erro', erro: ERRO_LOGIN }, p.cnpj);
          cont.erro += lote.length;
          codigo = 1;
          break;
        }
      }
      for (const p of lote) {
        // teto conferido antes de cada CNPJ: o que sobrar vira erro (o consultor pode pedir de novo)
        if (io.agora() - t0 >= cfg.tetoRodadaMs) {
          cont[await enviarSeguro(io, cfg, { id: p.id, status: 'erro', erro: ERRO_TEMPO }, p.cnpj)]++;
          continue;
        }
        let r;
        try {
          if (!sessao.nav) throw new Error('sem página aberta');
          r = await comTempo(consultarUm(sessao.nav, p.cnpj), cfg.tempoPorCnpjMs);
        } catch (e) {
          io.log('socios: uma consulta falhou: ' + limparErro(e, [...cfg.segredos, p.cnpj]));
          r = { status: 'erro', erro: ERRO_CONSULTA };
          if (sessao.nav) await trocarNavegador(io, cfg, sessao);
          else { try { sessao.nav = await sessao.novoNav(); } catch { /* segue sem página: próximos viram erro */ } }
        }
        cont[await enviarSeguro(io, cfg, { id: p.id, ...r }, p.cnpj)]++;
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
  // teto de 7 min (conferido antes de cada CNPJ): 7 + 60 s do CNPJ + ~65 s da página nova cabem no timeout de 10 min do job
  const cfg = { tetoRodadaMs: 7 * 60_000, tempoPorCnpjMs: 60_000, segredos: [cred.usuario, cred.senha, cred.cliente, ingest.token] };
  const io = {
    pegar: async (max) => ((await chamar({ ...ingest, corpo: { acao: 'pegar', max } })).pedidos || []),
    enviar: (corpo) => chamar({ ...ingest, corpo: { acao: 'resultado', ...corpo } }),
    async abrirSessao() {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
        const nav = await criarNavegador(context);
        await nav.entrar(cred);
        const novoNav = async () => { const n = await criarNavegador(context); await n.irParaBusca(); return n; };
        return { nav, novoNav, fechar: () => browser.close() };
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
