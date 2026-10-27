// src/procontact.js
// Única peça que fala com o site do ProContact. Sem screenshots/traces (a tela mostra telefones).
import path from 'node:path';
import { chromium } from 'playwright';
import { instalarCache } from './cacheEstatico.js';
import { campanhaEscolhida } from './discador.js';

// Tempo-limite de cada passo. No GitHub o ProContact entrega ~70 KB/s e a 1ª execução (cache vazio) baixa ~17 MB:
// o workflow sobe isto por PROCONTACT_TEMPO_MS; localmente 45 s bastam.
const TEMPO = Number(process.env.PROCONTACT_TEMPO_MS) || 45_000;

// Seletores confirmados na gravação de 02/10/2026 (codegen): campos input[name="login"] e input[name="password"],
// botão "Entrar". Exportados também para o script de reconhecimento (scripts/recon-calendario.js).
export async function entrar(page, usuario, senha) {
  await page.locator('input[name="login"]').fill(usuario);
  await page.locator('input[name="password"]').fill(senha);
  await page.getByRole('button', { name: /entrar/i }).click();
  const menu = page.getByText('Relatório', { exact: true }).first();
  const recusado = page.getByText(/senha inv[aá]lida|usu[aá]rio inv[aá]lido|credenciais|incorret/i).first();
  const resultado = await Promise.race([
    menu.waitFor({ timeout: TEMPO }).then(() => 'ok'),
    recusado.waitFor({ timeout: TEMPO }).then(() => 'recusado'),
  ]).catch(() => 'timeout');
  if (resultado === 'recusado') throw new Error('login recusado pelo ProContact');
  if (resultado === 'timeout') throw new Error('o menu não apareceu depois do login (tela mudou?)');
}

// O link "Chamadas Manuais" só aparece com os grupos do menu abertos (Relatório > Call Center). A gravação usou
// getByText('Call Center').nth(4), frágil: aqui abrimos "Relatório" e vamos clicando nos "Call Center" (do último
// para o primeiro) até o link ficar visível.
export async function abrirChamadasManuais(page) {
  return abrirRelatorio(page, 'Chamadas Manuais');
}
// Mesmo caminho para qualquer relatório de Call Center. Nome EXATO: no menu também existe "CRM do Discador".
export async function abrirRelatorio(page, nomeLink) {
  const link = page.getByRole('link', { name: nomeLink, exact: true });
  const visivel = () => link.isVisible().catch(() => false);
  if (!(await visivel())) {
    await page.getByText('Relatório', { exact: true }).first().click();
    const grupos = page.getByText('Call Center', { exact: true });
    for (let i = (await grupos.count()) - 1; i >= 0 && !(await visivel()); i--) {
      await grupos.nth(i).click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  if (!(await visivel())) throw new Error(`não achei o link "${nomeLink}" no menu (tela mudou?)`);
  await link.click();
  await page.getByText('Filtros').first().click(); // abre o painel de filtros, como na gravação (o texto traz um ícone junto)
}

const dois = (n) => String(n).padStart(2, '0');
const isoDia = (x) => `${x.y}-${dois(x.m)}-${dois(x.d)}`;
const brDia = (x) => `${dois(x.d)}/${dois(x.m)}/${x.y}`;
const RE_PERIODO = /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/;

// Período: o texto "dd/mm/aaaa hh:mm - dd/mm/aaaa hh:mm" abre um seletor de datas (vue-daterange-picker, mapeado em
// 02/10/2026 por scripts/recon-calendario.js) com dois calendários: mês anterior à esquerda, mês atual à direita.
// Cada dia é um td[data-date="aaaa-mm-dd"]; os dias do mês vizinho levam a classe "off" e ficam de fora. Clicam-se
// o dia inicial e o final (não há botão Aplicar; as horas ficam 00:00 e 23:59 por padrão).
async function definirPeriodo(page, periodo) {
  const campo = page.getByText(RE_PERIODO).first();
  await campo.click();
  const picker = page.locator('.daterangepicker');
  await picker.waitFor({ state: 'visible' });
  await picker.locator(`td[data-date="${isoDia(periodo.inicio)}"]:not(.off)`).first().click();
  await picker.locator(`td[data-date="${isoDia(periodo.fim)}"]:not(.off)`).first().click();
  await picker.waitFor({ state: 'hidden', timeout: 5_000 }).catch(async () => { await page.keyboard.press('Escape'); });
  const texto = ((await campo.innerText()) || '').replace(/\s+/g, ' ').trim();
  const esperado = `${brDia(periodo.inicio)} 00:00 - ${brDia(periodo.fim)}`;
  if (!texto.startsWith(esperado)) throw new Error('o período no filtro não ficou como pedido (tela mudou?)');
}

// Filtro "Equipes" (5º campo "Selecione"; as opções são AQUISIÇÃO - CLARO/TIM/GANHO/PERDIDO). O Rafael sempre marca
// AQUISIÇÃO - CLARO ao exportar; confirmado na gravação de 02/10/2026.
async function definirEquipe(page, equipe) {
  await page.getByRole('textbox', { name: 'Selecione' }).nth(4).click();
  const nome = equipe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(nome, 'i') }).first().click();
}

// Filtro "Campanha" do relatório do Discador: 4º "Selecione" (Status, Tentativa, Fila, Campanha — recon de 15/10/2026,
// scripts/recon-discador.js). Marca TODAS as opções cujo nome começa por um dos prefixos (o mês muda no nome).
async function definirCampanhas(page, prefixos, log) {
  const caixa = page.getByRole('textbox', { name: 'Selecione' }).nth(3);
  await caixa.click();
  const opcoes = page.getByRole('button', { name: /check_circle/ });
  await opcoes.first().waitFor();
  const alvo = (await opcoes.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => campanhaEscolhida(t, prefixos));
  if (!alvo.length) throw new Error('nenhuma campanha do discador começa com os prefixos pedidos (tela mudou?)');
  for (const t of alvo) {
    if (!(await opcoes.first().isVisible().catch(() => false))) await caixa.click();
    await page.getByRole('button', { name: t, exact: true }).first().click();
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape');
  // só a contagem: o repositório é público e os logs também (nome de campanha fica fora)
  log(`campanhas marcadas: ${alvo.length}`);
}

export function exportarRelatorio({ url, usuario, senha, periodo, equipe, pasta, log = () => {} }) {
  return exportar({ url, usuario, senha, pasta, log, relatorio: 'Chamadas Manuais', esperarTotal: true,
    filtros: async (page) => { await definirPeriodo(page, periodo); await definirEquipe(page, equipe); } });
}
export function exportarDiscador({ url, usuario, senha, periodo, campanhas, pasta, log = () => {} }) {
  return exportar({ url, usuario, senha, pasta, log, relatorio: 'Discador', esperarTotal: false,
    filtros: async (page) => { await definirPeriodo(page, periodo); await definirCampanhas(page, campanhas, log); } });
}

async function exportar({ url, usuario, senha, pasta, log, relatorio, filtros, esperarTotal }) {
  const browser = await chromium.launch({ headless: true });
  let cacheStat = null;
  try {
    const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
    cacheStat = await instalarCache(ctx, { host: new URL(url).host, pastaCache: process.env.PROCONTACT_CACHE || '.cache-estatico', log });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TEMPO);
    // Diagnóstico SEM dados: só host, status e tipo de falha (a tela de login do GitHub chegou a travar o evento
    // domcontentloaded por 45 s mesmo com o endereço respondendo HTTP 200 a um curl).
    // O host do ProContact sai como "procontact": o repositório é público e os logs do Actions também.
    const hostPc = new URL(url).host;
    const nomeHost = (h) => (h === hostPc ? 'procontact' : h);
    let falhas = 0;
    page.on('requestfailed', (r) => { if (falhas++ < 8) log(`rede: falhou ${nomeHost(new URL(r.url()).host)} (${r.failure()?.errorText ?? '?'})`); });
    let erros = 0, consoles = 0;
    const resumo = (u) => { try { const x = new URL(u); return `${nomeHost(x.host)}${x.pathname}`.slice(0, 90); } catch { return '?'; } };
    page.on('response', (r) => {
      if (r.request().isNavigationRequest()) log(`rede: navegação ${nomeHost(new URL(r.url()).host)} HTTP ${r.status()}`);
      else if (r.status() >= 400 && erros++ < 10) log(`rede: HTTP ${r.status()} em ${resumo(r.url())}`); // sem query string
    });
    const pendentes = new Map();
    page.on('request', (r) => pendentes.set(r, Date.now()));
    page.on('requestfinished', (r) => pendentes.delete(r));
    page.on('requestfailed', (r) => pendentes.delete(r));
    page.on('console', (m) => { if (m.type() === 'error' && consoles++ < 5) log(`console: ${m.text().replace(/\s+/g, ' ').slice(0, 140)}`); });
    page.on('pageerror', (e) => { if (consoles++ < 5) log(`erro na página: ${String(e.message).replace(/\s+/g, ' ').slice(0, 140)}`); });
    try {
      // 'commit' não espera os recursos da página; esperamos só o campo de login aparecer
      await page.goto(url, { waitUntil: 'commit' });
      await page.locator('input[name="login"]').waitFor({ timeout: TEMPO });
    } catch (e) {
      const titulo = (await page.title().catch(() => '?')).slice(0, 60);
      log(`abertura: página em ${page.url() ? nomeHost(new URL(page.url()).host) : '?'}, título "${titulo}"`);
      // a TELA DE LOGIN não tem dados de cliente: o texto visível ajuda a ver se é um aviso/bloqueio
      const visivel = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '(sem corpo)');
      log(`tela: "${visivel.replace(/\s+/g, ' ').trim().slice(0, 200)}"`);
      log(`campos na tela: ${await page.locator('input').count().catch(() => '?')} inputs, ${await page.locator('button').count().catch(() => '?')} botões`);
      // requisições que nunca terminaram (típico de servidor que descarta conexões de data center sem responder)
      const penduradas = [...pendentes.entries()].map(([r, t]) => `${r.method()} ${r.resourceType()} ${resumo(r.url())} (${Math.round((Date.now() - t) / 1000)}s)`);
      log(`requisições pendentes: ${penduradas.length}${penduradas.length ? ' — ' + penduradas.slice(0, 8).join(' | ') : ''}`);
      throw e;
    }
    const t0 = Date.now();
    const marca = (fase) => log(`tempo: ${fase} em ${Math.round((Date.now() - t0) / 1000)}s`);
    marca('login (campo apareceu)');
    await entrar(page, usuario, senha);
    marca('entrou');
    await abrirRelatorio(page, relatorio);
    marca(`menu e filtros (${relatorio})`);
    await filtros(page);
    marca('filtros aplicados');
    await page.getByRole('button', { name: /Buscar$/ }).click();
    // nas manuais a busca termina quando aparece o rodapé "total"; no discador (ainda sem esse sinal confirmado)
    // espera a rede assentar — o ensaio local (scripts/ensaio-discador.js) confirma
    if (esperarTotal) await page.getByText(/^total$/i).first().waitFor({ timeout: TEMPO });
    await page.waitForLoadState('networkidle');
    marca('busca concluída');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 600_000 }), // o Excel do discador (ontem+hoje) levou ~285 s para ser gerado em 15/10
      page.getByRole('button', { name: /Exportar$/ }).click(),
    ]);
    const destino = path.join(pasta, 'relatorio');
    await download.saveAs(destino);
    marca('exportação baixada');
    return destino;
  } finally {
    log(`cache estático: ${cacheStat?.cache ?? 0} do cache, ${cacheStat?.baixados ?? 0} baixados, ${cacheStat?.falhas ?? 0} falhas`);
    await browser.close();
  }
}
