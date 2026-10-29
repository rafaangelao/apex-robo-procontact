// src/periodo.js
import { partesSP } from './expediente.js';

const dois = (n) => String(n).padStart(2, '0');

// Dia 1 do mês 00:00 até hoje 23:59 (São Paulo). Nos dias 1 e 2 começa no mês anterior
// (cobre a virada de mês e ligações registradas com atraso).
export function periodoDoRelatorio(agora = new Date()) {
  const { y, m, d } = partesSP(agora);
  let iy = y, im = m;
  if (d <= 2) {
    im = m - 1;
    if (im === 0) { im = 12; iy = y - 1; }
  }
  return { inicio: { y: iy, m: im, d: 1, hh: 0, mm: 0 }, fim: { y, m, d, hh: 23, mm: 59 } };
}

// Rodada rápida (de 15 em 15 min): só hoje 00:00 até hoje 23:59 (São Paulo). O mês inteiro (ligação registrada com
// atraso, virada de mês) continua na rodada completa, de hora em hora.
export function periodoHoje(agora = new Date()) {
  const { y, m, d } = partesSP(agora);
  return { inicio: { y, m, d, hh: 0, mm: 0 }, fim: { y, m, d, hh: 23, mm: 59 } };
}

// Formato do filtro "Período" da tela do ProContact: "01/09/2026 00:00 - 01/10/2026 23:59"
export function formatarTela(p) {
  const f = (x) => `${dois(x.d)}/${dois(x.m)}/${x.y} ${dois(x.hh)}:${dois(x.mm)}`;
  return `${f(p.inicio)} - ${f(p.fim)}`;
}

export function paraIso(x, seg = '00') {
  return `${x.y}-${dois(x.m)}-${dois(x.d)}T${dois(x.hh)}:${dois(x.mm)}:${seg}-03:00`;
}

// Discador (REGRAS §87): ontem 00:00 até hoje 23:59 (São Paulo). O robô reenvia esses dois dias a cada hora
// (upsert por id): pega a tabulação feita depois da hora e a virada do dia; o relatório do mês inteiro é pesado demais.
export function periodoDiscador(agora = new Date()) {
  const { y, m, d } = partesSP(agora);
  const ontem = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return {
    inicio: { y: ontem.getUTCFullYear(), m: ontem.getUTCMonth() + 1, d: ontem.getUTCDate(), hh: 0, mm: 0 },
    fim: { y, m, d, hh: 23, mm: 59 },
  };
}
