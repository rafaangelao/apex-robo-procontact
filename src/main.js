// src/main.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dentroDoExpediente } from './expediente.js';
import { periodoDoRelatorio, formatarTela, paraIso } from './periodo.js';
import { lerPlanilha, parseRelatorio } from './parse.js';
import { chamar, enviarLotes } from './enviar.js';

// Mensagem de erro segura para log e para ligacoes_sync_log (lido por admin/supervisor): o Playwright inclui o
// "Call log" com os valores digitados (senha!) e URLs; aqui tiramos isso e mascaramos qualquer segredo conhecido.
// Equipe do filtro "Equipes" do ProContact (a que o Rafael sempre marca ao exportar; as outras são TIM, GANHO, PERDIDO).
export const EQUIPE_PADRAO = 'AQUISIÇÃO - CLARO';

export function limparErro(e, segredos) {
  let msg = String((e && e.message) || e).split(/\n\s*Call log:/)[0];
  for (const s of segredos) if (s && String(s).length >= 3) msg = msg.split(String(s)).join('***');
  return msg.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export async function executar(cfg, io) {
  const agora = cfg.agora ?? new Date();
  if (!cfg.forcar && !dentroDoExpediente(agora)) {
    io.log('Fora do expediente (07h-22h, seg-sáb, horário de São Paulo): nada a fazer.');
    return { codigo: 0, pulou: true };
  }
  const execucaoId = io.uuid();
  const periodo = periodoDoRelatorio(agora);
  const base = { execucao_id: execucaoId, iniciou_em: agora.toISOString(), periodo_de: paraIso(periodo.inicio), periodo_ate: paraIso(periodo.fim, '59') };
  const c = { lidas: 0, enviadas: 0, invalidas: 0, ignoradas_eagle: 0 };
  const pasta = io.pastaTemporaria();
  const chamarIngest = (corpo) => io.chamar({ url: cfg.ingestUrl, token: cfg.token, corpo });
  try {
    const arquivo = await io.exportar({ url: cfg.procontactUrl, usuario: cfg.usuario, senha: cfg.senha, textoPeriodo: formatarTela(periodo), periodo, equipe: cfg.equipe ?? EQUIPE_PADRAO, pasta });
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
  const { exportarRelatorio } = await import('./procontact.js'); // import tardio: os testes não precisam do Playwright
  const cfg = {
    procontactUrl: env('PROCONTACT_URL'), usuario: env('PROCONTACT_USUARIO'), senha: env('PROCONTACT_SENHA'),
    ingestUrl: env('INGEST_URL'), token: env('INGEST_TOKEN'),
    modo: process.env.MODO === 'dry' ? 'dry' : 'real', forcar: process.env.FORCAR === 'true',
    equipe: process.env.EQUIPE || EQUIPE_PADRAO,
  };
  const io = {
    exportar: exportarRelatorio, ler: (p) => fs.readFileSync(p), chamar, enviarLotes,
    uuid: () => crypto.randomUUID(),
    pastaTemporaria: () => fs.mkdtempSync(path.join(os.tmpdir(), 'procontact-')),
    limpar: (p) => fs.rmSync(p, { recursive: true, force: true }),
    log: (m) => console.log(m),
  };
  const r = await executar(cfg, io);
  process.exit(r.codigo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + String((e && e.message) || e).slice(0, 300)); process.exit(1); });
}
