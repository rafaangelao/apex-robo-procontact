// src/expediente.js
// São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
const SP_OFFSET_MS = 3 * 3600_000;

export function partesSP(date) {
  const s = new Date(date.getTime() - SP_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate(), dia: s.getUTCDay(), hora: s.getUTCHours(), min: s.getUTCMinutes() };
}

// Segunda a sábado, das 07:00 às 21:59 (hora de São Paulo).
export function dentroDoExpediente(date = new Date()) {
  const { dia, hora } = partesSP(date);
  return dia !== 0 && hora >= 7 && hora < 22;
}
