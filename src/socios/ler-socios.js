// src/socios/ler-socios.js — interpreta o texto das páginas da Nova Vida (§156). Funções puras, sem Playwright.
export const TETO_TELEFONES = 5;
const MAX_FONES = 10;
const OPERADORAS = new Set(['CLARO', 'VIVO', 'TIM', 'OI', 'NEXTEL', 'ALGAR', 'SERCOMTEL', 'CTBC', 'EMBRATEL', 'GVT']);
const ICONE = /^(?=.*[a-z])[a-z0-9_]+$/;            // ligadura de ícone (ex.: person_search); exige letra para não engolir o CPF
export const LINHA_CPF_FONTE = String.raw`^[\d.\-\s]+$`;   // a mesma regra é usada na página (novavida.js)
const LINHA_CPF = new RegExp(LINHA_CPF_FONTE);
const FONE = /^\(?(\d{2})\)?\s*(\d{4,5})-?(\d{4})\b/;

const linhas = (t) => String(t ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !ICONE.test(l));

export function lerCartaoSocio(texto, indice) {
  const ls = linhas(texto);
  const iCpf = ls.findIndex((l) => LINHA_CPF.test(l) && l.replace(/\D/g, '').length === 11);
  if (iCpf < 1) return null;
  const nome = ls.slice(0, iCpf).join(' ').replace(/\s+/g, ' ').trim();
  if (!nome) return null;
  const pct = ls.slice(iCpf + 1).map((l) => l.match(/^(\d{1,3}(?:[.,]\d+)?)\s*%$/)).find(Boolean);
  return { indice, nome, cpf: ls[iCpf].replace(/\D/g, ''), participacao: pct ? Number(pct[1].replace(',', '.')) : null };
}

export function ordenarSocios(lista) {
  return [...lista].sort((a, b) => {
    const pa = a.participacao ?? -1, pb = b.participacao ?? -1;
    return pb - pa || a.indice - b.indice;
  });
}

function marcar(t, texto) {
  for (const tok of texto.toUpperCase().split(/[\s·|,]+/)) {
    if (tok === 'WHATSAPP') t.whatsapp = true;
    else if (!t.operadora && OPERADORAS.has(tok)) t.operadora = tok;
  }
}
export function lerTelefones(texto, tipo) {
  const out = [];
  for (const l of linhas(texto)) {
    const m = l.match(FONE);
    if (m) {
      if (out.length >= MAX_FONES) break;
      out.push({ tipo, numero: m[1] + m[2] + m[3], operadora: null, whatsapp: false });
      marcar(out[out.length - 1], l.slice(m[0].length));
    } else if (out.length) {
      marcar(out[out.length - 1], l);
    }
  }
  return out;
}

export function paraResultado(s) {
  return { nome: s.nome, cpf: s.cpf, participacao: s.participacao, telefones_consultados: !!s.telefones_consultados, telefones: s.telefones || [] };
}
