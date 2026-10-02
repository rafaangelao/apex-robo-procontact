// src/enviar.js
// Fala com a Edge Function ingest-ligacoes (Plano A). Nenhuma mensagem de erro inclui o corpo enviado
// (telefones). Sem retentativas: 1 execução por hora; erro vira registro no log e aviso do GitHub.
export async function chamar({ url, token, corpo, fetchImpl = fetch }) {
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-robo-token': token },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try { json = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok) {
    const detalhe = json && typeof json.error === 'string' ? `: ${json.error.slice(0, 100)}` : '';
    throw new Error(`ingest respondeu ${resp.status}${detalhe}`);
  }
  return json;
}

export async function enviarLotes({ url, token, linhas, execucaoId, fetchImpl = fetch, tamanho = 500 }) {
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const lote = linhas.slice(i, i + tamanho);
    const r = await chamar({ url, token, corpo: { acao: 'lote', execucao_id: execucaoId, lote }, fetchImpl });
    gravadas += Number(r && r.gravadas) || 0;
  }
  return { gravadas };
}
