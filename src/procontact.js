// src/procontact.js
// Única peça que fala com o site do ProContact. Sem screenshots/traces (a tela mostra telefones).
import path from 'node:path';
import { chromium } from 'playwright';

const TEMPO = 45_000;

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
  const link = page.getByRole('link', { name: 'Chamadas Manuais' });
  const visivel = () => link.isVisible().catch(() => false);
  if (!(await visivel())) {
    await page.getByText('Relatório', { exact: true }).first().click();
    const grupos = page.getByText('Call Center', { exact: true });
    for (let i = (await grupos.count()) - 1; i >= 0 && !(await visivel()); i--) {
      await grupos.nth(i).click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  if (!(await visivel())) throw new Error('não achei o link "Chamadas Manuais" no menu (tela mudou?)');
  await link.click();
  await page.getByText('Filtros').first().click(); // abre o painel de filtros, como na gravação (o texto traz um ícone junto)
}

// O período é escolhido por CLIQUES no calendário (o texto "01/10/2026 00:00 - 02/10/2026 23:59" não é um campo
// digitável) e não há botão "Aplicar". Falta mapear o calendário: veja scripts/recon-calendario.js.
async function definirPeriodo() {
  throw new Error('seleção de datas pelo calendário ainda não implementada (aguarda o reconhecimento do calendário)');
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
