// src/discador.js
// Relatório do DISCADOR automático (Relatório > Call Center > Discador) → Edge Function ingest-discador (REGRAS §87/§89).
// Roda na mesma execução do robô, DEPOIS das chamadas manuais e isolado delas: uma falha aqui não muda o resultado das
// manuais; fica registrada em discador_sync_log (o painel avisa quando a sincronização para).
import { periodoDiscador, formatarTela, paraIso } from './periodo.js';
import { lerPlanilha } from './parse.js';
import { parseDiscador } from './parseDiscador.js';
import { limparErro } from './erro.js';

// Campanhas exportadas, pelo COMEÇO do nome (o mês muda no nome): Apex e Campinas. Variável DISCADOR_CAMPANHAS
// (separada por vírgula) troca a lista sem mexer em código. Mantenha igual a config.discador.campanhas no banco.
export const CAMPANHAS_PADRAO = 'DISCADOR-APEX-,MIGRACAO-CLARO';
export function prefixosCampanhas(valor) {
  return String(valor ?? CAMPANHAS_PADRAO).split(',').map((x) => x.trim()).filter(Boolean);
}
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^CHECK_CIRCLE\s+/, '').trim();
export function campanhaEscolhida(texto, prefixos) {
  const t = semAcento(texto);
  return prefixos.some((p) => t.startsWith(semAcento(p)));
}

export async function executarDiscador(cfg, io) {
  const agora = cfg.agora ?? new Date();
  const periodo = periodoDiscador(agora);
  const execucaoId = io.uuid();
  const base = { execucao_id: execucaoId, iniciou_em: agora.toISOString(), periodo_de: paraIso(periodo.inicio), periodo_ate: paraIso(periodo.fim, '59') };
  const c = { lidas: 0, enviadas: 0, invalidas: 0 };
  const pasta = io.pastaTemporaria();
  const chamarIngest = (corpo) => io.chamar({ url: cfg.discadorUrl, token: cfg.discadorToken, corpo });
  try {
    const campanhas = prefixosCampanhas(cfg.campanhas);
    const arquivo = await io.exportarDiscador({ url: cfg.procontactUrl, usuario: cfg.usuario, senha: cfg.senha, textoPeriodo: formatarTela(periodo), periodo, campanhas, pasta, log: io.log });
    const p = parseDiscador(lerPlanilha(io.ler(arquivo)));
    if (p.faltando.length) throw new Error('relatório do discador sem as colunas: ' + p.faltando.join(', '));
    c.lidas = p.lidas; c.invalidas = p.invalidas;
    io.log(`Discador: lidas ${p.lidas}; válidas ${p.linhas.length}; inválidas ${p.invalidas}.`);
    if (cfg.modo === 'dry') {
      const { total } = await chamarIngest({ acao: 'contar', de: base.periodo_de, ate: base.periodo_ate });
      io.log(`Discador, conferência (nada foi gravado): o arquivo tem ${p.linhas.length} chamadas válidas; o banco tem ${total} no mesmo período.`);
      return { codigo: 0, dry: true, validas: p.linhas.length, noBanco: total };
    }
    if (p.linhas.length) {
      const { gravadas } = await io.enviarLotes({ url: cfg.discadorUrl, token: cfg.discadorToken, linhas: p.linhas, execucaoId });
      c.enviadas = gravadas;
    }
    await chamarIngest({ acao: 'final', ...base, ok: true, ...c, erro: null });
    io.log(`Discador sincronizado: ${c.enviadas} chamadas enviadas.`);
    return { codigo: 0, enviadas: c.enviadas };
  } catch (e) {
    const segredos = [cfg.usuario, cfg.senha, cfg.procontactUrl, cfg.discadorToken, cfg.discadorUrl];
    const msg = limparErro(e, segredos);
    io.log('ERRO no discador: ' + msg);
    if (cfg.modo !== 'dry') {
      try { await chamarIngest({ acao: 'final', ...base, ok: false, ...c, erro: msg }); }
      catch (e2) { io.log('Não foi possível registrar o erro do discador: ' + limparErro(e2, segredos).slice(0, 100)); }
    }
    return { codigo: 1 };
  } finally {
    io.limpar(pasta);
  }
}
