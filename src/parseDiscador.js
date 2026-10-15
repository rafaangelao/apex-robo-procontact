// src/parseDiscador.js
// Leitor do relatório do DISCADOR automático (Relatório → Call Center → Discador → Exportar; dialer_calls_report_*.xlsx).
// Spec: apex-smart-solutions docs/superpowers/specs/2026-10-14-discador-visao-supervisao-design.md (§87).
// O layout tem colunas quase homônimas: "Data/Hora Fim" (UTC) × "DataHora_Fim" (São Paulo), "Tempo Total" (segundos) ×
// "Tempo_Total" (hh:mm:ss) e duas "Região". Por isso o casamento usa normExata, que mantém o "_".
// Nome (Nome/Desc) e CPF (Documento 1) NUNCA são lidos.
import { dataHora, segundos } from './parse.js';

export const normExata = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9_]/g, '');

// campo → nomes aceitos (já em normExata). SheetJS renomeia a 2ª "Região" para "Região_1".
const COLUNAS = {
  id: ['id'], gerada: ['datahora_geracao'], conectada: ['datahora_conectado'], atendida: ['datahora_atendimento'],
  fim: ['datahora_fim'], status: ['status'], agente: ['iddousuario'], espera: ['tempo_espera'], falados: ['tempo_chamada'],
  total: ['tempo_total'], tab: ['ultimatabulacao'], cargaId: ['codcarga'], carga: ['carga'], campanha: ['campanha'],
  cnpj: ['documento2'], telefone: ['telefone'], operadora: ['campo1'], cidade: ['campo3'], regiao: ['regiao', 'regiao_1'],
  grav: ['gravacao'],
};
const OBRIGATORIAS = ['id', 'gerada', 'status'];

export function parseDiscador(rows) {
  const out = { linhas: [], lidas: 0, invalidas: 0, faltando: [] };
  const colunas = rows && rows.length ? Object.keys(rows[0]) : (rows && Array.isArray(rows.cabecalho) ? rows.cabecalho : null);
  if (colunas === null) return out;
  const mapa = {}; // campo → lista de cabeçalhos originais, na ordem dos nomes aceitos
  Object.entries(COLUNAS).forEach(([campo, aceitos]) => {
    const achados = aceitos.map((a) => colunas.find((k) => normExata(k) === a)).filter(Boolean);
    if (achados.length) mapa[campo] = achados;
  });
  out.faltando = OBRIGATORIAS.filter((c) => !(c in mapa));
  if (out.faltando.length) return out;
  out.lidas = rows.length;

  const txt = (r, campo) => {
    for (const k of mapa[campo] || []) {
      const v = r[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };
  const inteiro = (r, campo) => { const t = txt(r, campo); const n = Number(t); return t != null && Number.isInteger(n) ? n : null; };
  const seg = (r, campo) => (txt(r, campo) == null ? null : segundos(txt(r, campo)));
  const digitos = (r, campo) => { const d = (txt(r, campo) || '').replace(/\D/g, ''); return d || null; };

  const vistos = new Set();
  rows.forEach((r) => {
    const id = Number(txt(r, 'id'));
    const gerada = dataHora(txt(r, 'gerada'));
    const status = (txt(r, 'status') || '').toUpperCase();
    if (!Number.isSafeInteger(id) || id <= 0 || !gerada || !/^[A-Z_]{1,30}$/.test(status)) { out.invalidas++; return; }
    if (vistos.has(id)) return;
    vistos.add(id);
    const cnpj = digitos(r, 'cnpj');
    out.linhas.push({
      id, gerada_em: gerada,
      conectada_em: dataHora(txt(r, 'conectada')), atendida_em: dataHora(txt(r, 'atendida')), fim_em: dataHora(txt(r, 'fim')),
      status, agente_id: inteiro(r, 'agente'),
      seg_espera: seg(r, 'espera'), seg_falados: seg(r, 'falados'), seg_total: seg(r, 'total'),
      tabulacao: txt(r, 'tab'), carga_id: inteiro(r, 'cargaId'), carga: txt(r, 'carga'), campanha: txt(r, 'campanha'),
      cnpj: cnpj && cnpj.length <= 14 ? cnpj.padStart(14, '0') : null,
      telefone: digitos(r, 'telefone'),
      operadora_base: txt(r, 'operadora'), cidade: txt(r, 'cidade'), regiao: txt(r, 'regiao'), gravacao: txt(r, 'grav'),
    });
  });
  return out;
}
