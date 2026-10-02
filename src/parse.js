// src/parse.js
// Porte de mlParseRelatorio (_template.html, REGRAS_NEGOCIO.md 59.3 e 65). Manter as duas versões iguais.
import XLSX from 'xlsx';

// Colunas do relatório (nome já normalizado por normCol).
const COLUNAS = { id: 'id', usuario: 'usuario', telefone: 'telefone', gerada: 'datahorageracao', status: 'status', tempo: 'tempochamada', tab: 'ultimatabulacao', transf: 'transferido', grav: 'gravacao' };
const OBRIGATORIAS = ['id', 'usuario', 'telefone', 'gerada', 'status'];

export const normCol = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function segundos(t) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(t == null ? '' : t).trim());
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}

// "08/09/2026 12:20:59" (ou ISO "2026-09-08 12:20:59") -> "2026-09-08T12:20:59-03:00"; qualquer outra coisa -> null
export function dataHora(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00`;
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00` : null;
}

export const ehEagle = (usuario) => /^eagle/i.test(String(usuario || '').trim());

// Primeira aba; cada linha vira {cabeçalho: texto}. raw:false mantém o texto como aparece no Excel.
export function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { raw: false, defval: null });
}

export function parseRelatorio(rows) {
  const out = { linhas: [], lidas: 0, invalidas: 0, ignoradasEagle: 0, faltando: [] };
  if (!rows || !rows.length) return out; // relatório sem ligações no período: válido
  out.lidas = rows.length;
  const mapa = {};
  Object.keys(rows[0]).forEach((k) => {
    const n = normCol(k);
    Object.keys(COLUNAS).forEach((ch) => { if (COLUNAS[ch] === n && !(ch in mapa)) mapa[ch] = k; });
  });
  out.faltando = OBRIGATORIAS.filter((ch) => !(ch in mapa));
  if (out.faltando.length) { out.lidas = 0; return out; }
  const txt = (r, ch) => (mapa[ch] && r[mapa[ch]] != null && String(r[mapa[ch]]).trim() !== '') ? String(r[mapa[ch]]).trim() : null;
  const vistos = new Set();
  rows.forEach((r) => {
    const id = Number(txt(r, 'id'));
    const gerada = dataHora(txt(r, 'gerada'));
    const usuario = txt(r, 'usuario');
    if (!Number.isFinite(id) || id <= 0 || !gerada || !usuario) { out.invalidas++; return; }
    if (ehEagle(usuario)) { out.ignoradasEagle++; return; }
    if (vistos.has(id)) return;
    vistos.add(id);
    const tel = (txt(r, 'telefone') || '').replace(/\D/g, '');
    out.linhas.push({
      id, usuario, telefone: tel || null, gerada_em: gerada,
      atendida: String(txt(r, 'status') || '').toUpperCase() === 'ANSWERED',
      seg_falados: segundos(txt(r, 'tempo')),
      tabulacao: txt(r, 'tab'), transferido: txt(r, 'transf'), gravacao: txt(r, 'grav'),
    });
  });
  return out;
}
