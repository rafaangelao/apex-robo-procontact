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

// Primeira aba; cada linha vira {cabeçalho: valor}. raw:true, IGUAL ao upload manual do painel (mlLinhasDoWorkbook):
// com raw:false um telefone guardado como número viraria '5.51199E+12'. O array devolvido leva também .cabecalho
// (nomes das colunas), para detectar relatório de outro formato mesmo quando não há nenhuma linha.
export function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
  const cab = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })[0];
  rows.cabecalho = Array.isArray(cab) ? cab.filter((c) => c != null) : [];
  return rows;
}

export function parseRelatorio(rows) {
  const out = { linhas: [], lidas: 0, invalidas: 0, ignoradasEagle: 0, faltando: [] };
  // sem linhas: se sabemos o cabeçalho, confere as colunas (outro relatório não vira "sucesso com 0 linhas");
  // sem nenhuma informação de cabeçalho, é só "sem ligações no período"
  const colunas = rows && rows.length ? Object.keys(rows[0]) : (rows && Array.isArray(rows.cabecalho) ? rows.cabecalho : null);
  if (colunas === null) return out;
  out.lidas = rows.length;
  const mapa = {};
  colunas.forEach((k) => {
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
