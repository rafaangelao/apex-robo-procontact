// src/main.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dentroDoExpediente } from './expediente.js';
import { periodoDoRelatorio, periodoHoje, formatarTela, paraIso } from './periodo.js';
import { lerPlanilha, parseRelatorio } from './parse.js';
import { chamar, enviarLotes } from './enviar.js';
import { limparErro } from './erro.js'; // mensagem de erro sem senha/token/"Call log" (também usada pelo discador)
import { executarDiscador } from './discador.js';

export { limparErro };

// Equipe do filtro "Equipes" do ProContact (a que o Rafael sempre marca ao exportar; as outras são TIM, GANHO, PERDIDO).
export const EQUIPE_PADRAO = 'AQUISIÇÃO - CLARO';

// O discador (pesado: ~6 min) só roda na rodada completa, de hora em hora; a rápida (15 em 15 min) é só das manuais.
export function rodaDiscador(cfg, r) {
  return !r.pulou && cfg.discadorAtivo && !cfg.rapido;
}

export async function executar(cfg, io) {
  const agora = cfg.agora ?? new Date();
  // A rápida respeita o expediente mesmo forçada: o disparo pela API (pg_cron) sempre chega com FORCAR=true
  if ((cfg.rapido || !cfg.forcar) && !dentroDoExpediente(agora)) {
    io.log('Fora do expediente (07h-22h, seg-sáb, horário de São Paulo): nada a fazer.');
    return { codigo: 0, pulou: true };
  }
  const execucaoId = io.uuid();
  const periodo = cfg.rapido ? periodoHoje(agora) : periodoDoRelatorio(agora);
  const base = { execucao_id: execucaoId, iniciou_em: agora.toISOString(), periodo_de: paraIso(periodo.inicio), periodo_ate: paraIso(periodo.fim, '59') };
  const c = { lidas: 0, enviadas: 0, invalidas: 0, ignoradas_eagle: 0 };
  const pasta = io.pastaTemporaria();
  const chamarIngest = (corpo) => io.chamar({ url: cfg.ingestUrl, token: cfg.token, corpo });
  try {
    const arquivo = await io.exportar({ url: cfg.procontactUrl, usuario: cfg.usuario, senha: cfg.senha, textoPeriodo: formatarTela(periodo), periodo, equipe: cfg.equipe ?? EQUIPE_PADRAO, pasta, log: io.log });
    const p = parseRelatorio(lerPlanilha(io.ler(arquivo)));
    if (p.faltando.length) throw new Error('relatório sem as colunas: ' + p.faltando.join(', '));
    c.lidas = p.lidas; c.invalidas = p.invalidas; c.ignoradas_eagle = p.ignoradasEagle;
    io.log(`Lidas ${p.lidas}; válidas ${p.linhas.length}; inválidas ${p.invalidas}; ignoradas (Eagle) ${p.ignoradasEagle}.`);
    if (p.linhas.length === 0 && p.invalidas > 0) throw new Error('nenhuma ligação válida no relatório (o formato mudou?)');
    if (cfg.modo === 'dry') {
      const { total } = await chamarIngest({ acao: 'contar', de: base.periodo_de, ate: base.periodo_ate });
      io.log(`Conferência (nada foi gravado): o arquivo tem ${p.linhas.length} ligações válidas; o banco tem ${total} no mesmo período.`);
      return { codigo: 0, dry: true, validas: p.linhas.length, noBanco: total };
    }
    if (p.linhas.length) {
      const { gravadas } = await io.enviarLotes({ url: cfg.ingestUrl, token: cfg.token, linhas: p.linhas, execucaoId });
      c.enviadas = gravadas;
    }
    await chamarIngest({ acao: 'final', ...base, ok: true, ...c, erro: null });
    io.log(`Sincronizado: ${c.enviadas} ligações enviadas.`);
    return { codigo: 0, enviadas: c.enviadas };
  } catch (e) {
    const segredos = [cfg.usuario, cfg.senha, cfg.procontactUrl, cfg.token, cfg.ingestUrl];
    const msg = limparErro(e, segredos);
    io.log('ERRO: ' + msg);
    if (cfg.modo !== 'dry') {
      try { await chamarIngest({ acao: 'final', ...base, ok: false, ...c, erro: msg }); }
      catch (e2) { io.log('Não foi possível registrar o erro: ' + limparErro(e2, segredos).slice(0, 100)); }
    }
    return { codigo: 1 };
  } finally {
    io.limpar(pasta);
  }
}

function env(k) {
  const v = process.env[k];
  if (!v) throw new Error(`variável de ambiente ausente: ${k}`);
  return v;
}

async function main() {
  const { exportarRelatorio, exportarDiscador } = await import('./procontact.js'); // import tardio: os testes não precisam do Playwright
  const cfg = {
    procontactUrl: env('PROCONTACT_URL'), usuario: env('PROCONTACT_USUARIO'), senha: env('PROCONTACT_SENHA'),
    ingestUrl: env('INGEST_URL'), token: env('INGEST_TOKEN'),
    modo: process.env.MODO === 'dry' ? 'dry' : 'real', forcar: process.env.FORCAR === 'true',
    // Rodada rápida (pg_cron robo-procontact-rapido, de 15 em 15 min): só as manuais de hoje, sem o discador
    rapido: process.env.RAPIDO === 'sim',
    equipe: process.env.EQUIPE || EQUIPE_PADRAO,
    // Discador (REGRAS §87/§89): liga/desliga pela variável DISCADOR_ATIVO, sem mexer em código
    discadorAtivo: process.env.DISCADOR_ATIVO === 'true',
    discadorUrl: process.env.INGEST_DISCADOR_URL, discadorToken: process.env.INGEST_DISCADOR_TOKEN,
    campanhas: process.env.DISCADOR_CAMPANHAS || undefined,
  };
  const io = {
    exportar: exportarRelatorio, exportarDiscador, ler: (p) => fs.readFileSync(p), chamar, enviarLotes,
    uuid: () => crypto.randomUUID(),
    pastaTemporaria: () => fs.mkdtempSync(path.join(os.tmpdir(), 'procontact-')),
    limpar: (p) => fs.rmSync(p, { recursive: true, force: true }),
    log: (m) => console.log(m),
  };
  const r = await executar(cfg, io);
  // Discador DEPOIS das manuais e isolado: a falha fica em discador_sync_log e não muda o código de saída das manuais
  if (rodaDiscador(cfg, r)) {
    if (!cfg.discadorUrl || !cfg.discadorToken) console.log('AVISO: DISCADOR_ATIVO=true sem INGEST_DISCADOR_URL/INGEST_DISCADOR_TOKEN; o discador não rodou.');
    else {
      const rd = await executarDiscador(cfg, io);
      if (rd.codigo !== 0) console.log('AVISO: o discador falhou nesta execução (ver discador_sync_log); as chamadas manuais não foram afetadas.');
    }
  }
  process.exit(r.codigo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + String((e && e.message) || e).slice(0, 300)); process.exit(1); });
}
