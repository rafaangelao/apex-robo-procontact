// src/cacheEstatico.js
// Cache local dos arquivos ESTÁTICOS do ProContact (js/css/fontes/imagens). Motivo: do GitHub o servidor entrega a
// ~70 KB/s e o app.js tem 12,9 MB sem compressão (~3 min), mas manda "Cache-Control: no-store" (o navegador nunca guarda).
// Como há ETag, guardamos nossa cópia e só perguntamos "mudou?" (If-None-Match -> 304, instantâneo). A pasta é
// preservada entre execuções pelo actions/cache do workflow. Só arquivos públicos (sem cookie) e só quando há ETag.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXT_ESTATICA = /\.(?:js|css|woff2?|ttf|eot|otf|svg|png|jpe?g|gif|ico)$/i;

export function ehEstatico(u, host) {
  return u.host === host && EXT_ESTATICA.test(u.pathname);
}

const chaveDe = (url) => crypto.createHash('sha1').update(url).digest('hex');

function lerCache(pastaCache, chave) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(pastaCache, `${chave}.json`), 'utf8'));
    const body = fs.readFileSync(path.join(pastaCache, `${chave}.bin`));
    return meta && typeof meta.etag === 'string' ? { etag: meta.etag, tipo: meta.tipo, body } : null;
  } catch {
    return null; // sem cache ou corrompido: baixa de novo
  }
}

// Devolve { status, body, tipo, origem: 'cache' | 'baixado' }.
export async function obterEstatico({ url, pastaCache, fetchImpl = fetch, timeoutMs = 600_000 }) {
  fs.mkdirSync(pastaCache, { recursive: true });
  const chave = chaveDe(url);
  const guardado = lerCache(pastaCache, chave);
  const headers = guardado ? { 'if-none-match': guardado.etag } : {};
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 304 && guardado) return { status: 200, body: guardado.body, tipo: guardado.tipo, origem: 'cache' };
  const body = Buffer.from(await r.arrayBuffer());
  const tipo = r.headers.get('content-type') || 'application/octet-stream';
  const etag = r.headers.get('etag');
  if (r.ok && etag) {
    fs.writeFileSync(path.join(pastaCache, `${chave}.bin`), body);
    fs.writeFileSync(path.join(pastaCache, `${chave}.json`), JSON.stringify({ etag, tipo }));
  }
  return { status: r.status, body, tipo, origem: 'baixado', guardado: Boolean(r.ok && etag) };
}

// Liga o cache ao contexto do Playwright: intercepta os GET de estáticos do host e responde com obterEstatico().
export async function instalarCache(ctx, { host, pastaCache, log = () => {} }) {
  const estat = { cache: 0, baixados: 0, falhas: 0 };
  await ctx.route((u) => ehEstatico(u, host), async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.continue();
    try {
      const r = await obterEstatico({ url: req.url(), pastaCache });
      estat[r.origem === 'cache' ? 'cache' : 'baixados']++;
      if (r.origem === 'baixado') log(`cache: baixado ${new URL(req.url()).pathname.slice(0, 70)} (${r.body.length} bytes, ${r.guardado ? 'guardado' : 'SEM ETag, não guardado'})`);
      return await route.fulfill({ status: r.status, contentType: r.tipo, body: r.body });
    } catch (e) {
      estat.falhas++;
      log(`cache: falhou ${new URL(req.url()).pathname.slice(0, 60)} (${e.name})`);
      return route.continue();
    }
  });
  return estat;
}
