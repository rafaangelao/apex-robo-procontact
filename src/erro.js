// src/erro.js
// Mensagem de erro segura para log e para os *_sync_log (lidos por admin/supervisor): o Playwright inclui o
// "Call log" com os valores digitados (senha!) e URLs; aqui tiramos isso e mascaramos qualquer segredo conhecido.
export function limparErro(e, segredos) {
  let msg = String((e && e.message) || e).split(/\n\s*Call log:/)[0];
  for (const s of segredos) if (s && String(s).length >= 3) msg = msg.split(String(s)).join('***');
  return msg.replace(/\s+/g, ' ').trim().slice(0, 300);
}
