// src/procontact.js
// Única peça que fala com o site do ProContact. Sem screenshots/traces (a tela mostra telefones).
import path from 'node:path';
import { chromium } from 'playwright';

const TEMPO = 45_000;

async function entrar(page, usuario, senha) {
  await page.getByLabel(/usu[aá]rio|login|e-?mail/i).first().fill(usuario);
  await page.getByLabel(/senha/i).first().fill(senha);
  await page.getByRole('button', { name: /entrar|login|acessar/i }).first().click();
  const menu = page.getByText('Relatório', { exact: true }).first();
  const recusado = page.getByText(/senha inv[aá]lida|usu[aá]rio inv[aá]lido|credenciais|incorret/i).first();
  const resultado = await Promise.race([
    menu.waitFor({ timeout: TEMPO }).then(() => 'ok'),
    recusado.waitFor({ timeout: TEMPO }).then(() => 'recusado'),
  ]).catch(() => 'timeout');
  if (resultado === 'recusado') throw new Error('login recusado pelo ProContact');
  if (resultado === 'timeout') throw new Error('o menu não apareceu depois do login (tela mudou?)');
}

async function abrirChamadasManuais(page) {
  await page.getByText('Relatório', { exact: true }).first().click();
  // "Call Center" existe no menu principal e dentro de Relatório; o de dentro vem depois no DOM.
  await page.getByText('Call Center', { exact: true }).last().click();
  await page.getByText('Chamadas Manuais', { exact: true }).click();
  await page.getByText(/^filtros$/i).first().waitFor({ timeout: TEMPO });
}

async function campoPeriodo(page) {
  const porRotulo = page.getByLabel(/per[ií]odo/i).first();
  if (await porRotulo.count()) return porRotulo;
  return page.locator('input[value*="/20"]').first();
}

async function definirPeriodo(page, texto) {
  const campo = await campoPeriodo(page);
  await campo.click();
  await campo.press('Control+A');
  await campo.fill(texto);
  await campo.press('Enter');
  const aplicar = page.getByRole('button', { name: /aplicar|ok|confirmar/i }).first();
  if (await aplicar.isVisible().catch(() => false)) await aplicar.click();
  const valor = await campo.inputValue();
  if (valor.trim() !== texto) throw new Error('não consegui definir o período no filtro (tela mudou?)');
}

export async function exportarRelatorio({ url, usuario, senha, textoPeriodo, pasta }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TEMPO);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await entrar(page, usuario, senha);
    await abrirChamadasManuais(page);
    await definirPeriodo(page, textoPeriodo);
    await page.getByRole('button', { name: /buscar/i }).click();
    await page.getByText('TOTAL', { exact: true }).first().waitFor({ timeout: TEMPO });
    await page.waitForLoadState('networkidle');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      page.getByRole('button', { name: /exportar/i }).click(),
    ]);
    const destino = path.join(pasta, 'relatorio');
    await download.saveAs(destino);
    return destino;
  } finally {
    await browser.close();
  }
}
