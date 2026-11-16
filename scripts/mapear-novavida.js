// scripts/mapear-novavida.js — RODAR SÓ LOCALMENTE. Confere se a navegação acha cartões e telefones e grava o TEXTO
// MASCARADO (letras viram x/X, dígitos viram 0; rótulos do site preservados) em recon/socios-mascarado.txt para
// montar fixtures fictícias. Lê .env.novavida (ignorado pelo git): NOVAVIDA_USUARIO, NOVAVIDA_SENHA,
// NOVAVIDA_EMPRESA, MAPEAR_CNPJ. Não imprime nenhum dado: só contagens.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { criarNavegador } from '../src/socios/novavida.js';

const MANTER = new Set(['Participação', 'em', 'empresas', 'Telefones', 'fixos', 'Celulares', 'Mobilidade', 'cadastral',
  'MEDIA', 'BAIXA', 'ALTA', 'WHATSAPP', 'PROCON', 'CLARO', 'VIVO', 'TIM', 'OI', 'NEXTEL', 'ALGAR', 'SERCOMTEL', 'Sócios']);
export function mascarar(t) {
  return String(t ?? '').replace(/[A-Za-zÀ-ÿ]+/g, (w) => (MANTER.has(w) ? w : w.replace(/[a-zß-ÿ]/g, 'x').replace(/[A-ZÀ-Þ]/g, 'X')))
    .replace(/\d/g, '0');
}
const env = Object.fromEntries(fs.readFileSync('.env.novavida', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const nav = await criarNavegador(context);
  await nav.entrar({ usuario: env.NOVAVIDA_USUARIO, senha: env.NOVAVIDA_SENHA, cliente: env.NOVAVIDA_EMPRESA });
  console.log('login: ok');
  console.log('busca:', await nav.buscarCnpj(env.MAPEAR_CNPJ) ? 'ok' : 'NÃO ACHOU');
  console.log('sócios:', await nav.abrirSocios() ? 'ok' : 'NÃO ABRIU');
  const cartoes = await nav.lerCartoes();
  console.log('cartões de sócio:', cartoes.length);
  const saida = ['=== CARTÕES ===', ...cartoes.map((c, i) => `--- cartão ${i} ---\n${mascarar(c)}`)];
  if (cartoes.length) {
    const p = await nav.lerPessoa(0);
    console.log('pessoa 0: fixos', p.fixos ? 'achou' : 'NÃO ACHOU', '· celulares', p.celulares ? 'achou' : 'NÃO ACHOU');
    saida.push('=== FIXOS (sócio 0) ===', mascarar(p.fixos), '=== CELULARES (sócio 0) ===', mascarar(p.celulares));
    console.log('voltou para Sócios:', (await nav.lerCartoes()).length === cartoes.length ? 'ok' : 'NÃO');
  }
  fs.mkdirSync('recon', { recursive: true });
  fs.writeFileSync('recon/socios-mascarado.txt', saida.join('\n') + '\n');
  console.log('gravado: recon/socios-mascarado.txt');
} finally {
  await browser.close();
}
