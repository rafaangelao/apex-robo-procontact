// scripts/carga-discador.js — CARGA INICIAL do discador a partir de um Excel baixado à mão (uma vez).
// Usa o MESMO leitor do robô (parseDiscador) e a MESMA função (ingest-discador). Imprime só contagens: nada de telefone,
// CNPJ ou nome no terminal. O arquivo fica onde está (fora de qualquer repositório).
// Uso (o mês inteiro precisa de ~1,5 GB de memória: use --max-old-space-size=6144):
// node --max-old-space-size=6144 scripts/carga-discador.js <arquivo.xlsx> --dry
//      INGEST_DISCADOR_URL=... INGEST_DISCADOR_TOKEN=... node --max-old-space-size=6144 scripts/carga-discador.js <arquivo.xlsx>
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lerPlanilha } from '../src/parse.js';
import { parseDiscador } from '../src/parseDiscador.js';
import { chamar, enviarLotes } from '../src/enviar.js';

const [arquivo, flag] = process.argv.slice(2);
if (!arquivo || !fs.existsSync(arquivo)) { console.error('Uso: node scripts/carga-discador.js <arquivo.xlsx> [--dry]'); process.exit(2); }
const dry = flag === '--dry';

const iniciou = new Date().toISOString();
const p = parseDiscador(lerPlanilha(fs.readFileSync(arquivo)));
if (p.faltando.length) { console.error('Relatório em outro formato; faltam:', p.faltando.join(', ')); process.exit(1); }
const conta = (f) => p.linhas.reduce((m, l) => (m[f(l)] = (m[f(l)] || 0) + 1, m), {});
if (!p.linhas.length) { console.error(`Nenhuma chamada válida no arquivo (lidas ${p.lidas}, inválidas ${p.invalidas}); nada a enviar.`); process.exit(1); }
const datas = p.linhas.map((l) => l.gerada_em).sort();
const de = datas[0];
const ate = datas[datas.length - 1];
console.log({
  lidas: p.lidas, validas: p.linhas.length, invalidas: p.invalidas, primeira: de, ultima: ate,
  porStatus: conta((l) => l.status), porCarga: conta((l) => l.carga || '(sem carga)'),
  atendidasComAgente: p.linhas.filter((l) => l.status === 'ANSWERED' && l.agente_id != null).length,
});
if (dry) process.exit(0);

const url = process.env.INGEST_DISCADOR_URL;
const token = process.env.INGEST_DISCADOR_TOKEN;
if (!url || !token) { console.error('Defina INGEST_DISCADOR_URL e INGEST_DISCADOR_TOKEN.'); process.exit(2); }
const execucaoId = randomUUID();
let ok = false;
let erro = null;
let gravadas = 0;
try {
  ({ gravadas } = await enviarLotes({ url, token, linhas: p.linhas, execucaoId }));
  ok = true;
} catch (e) {
  erro = String(e.message || e).slice(0, 200);
}
await chamar({ url, token, corpo: {
  acao: 'final', execucao_id: execucaoId, iniciou_em: iniciou, ok, lidas: p.lidas, enviadas: p.linhas.length,
  invalidas: p.invalidas, periodo_de: de || null, periodo_ate: ate || null, erro,
} });
const { total } = await chamar({ url, token, corpo: { acao: 'contar', de, ate } });
console.log({ ok, gravadas, noBancoNoPeriodo: total, erro });
process.exit(ok && total >= p.linhas.length ? 0 : 1);
