// scripts/recon-discador.js
// DIAGNÓSTICO (não faz parte do robô): entra no ProContact, abre Relatório > Call Center > Discador > Filtros e salva
// em recon/ o HTML e uma imagem da tela de filtros e do seletor de período, e imprime cada campo "Selecione" com as
// opções que ele oferece (campanhas, equipes...). NÃO clica em Buscar: nenhum telefone/dado de cliente aparece.
// Uso:  node scripts/recon-discador.js   (pergunta usuário e senha; a senha é digitada oculta)
import fs from 'node:fs';
import { chromium } from 'playwright';
import { perguntar } from './prompt.js';
import { entrar } from '../src/procontact.js';

const url = process.env.PROCONTACT_URL || 'https://eaglesales.procontact.com.br/pages/login';
const usuario = process.env.PROCONTACT_USUARIO || (await perguntar('Usuário do ProContact: ')).trim();
const senha = process.env.PROCONTACT_SENHA || (await perguntar('Senha (oculta): ', true));
if (!usuario || !senha) { console.error('Usuário e senha são obrigatórios.'); process.exit(1); }

fs.mkdirSync('recon', { recursive: true });
// tudo o que é impresso também vai para recon/discador-resumo.txt (o Claude lê dali; recon/ está no .gitignore)
fs.writeFileSync('recon/discador-resumo.txt', '');
const logOriginal = console.log;
console.log = (...a) => { logOriginal(...a); fs.appendFileSync('recon/discador-resumo.txt', a.join(' ') + '
'); };
const browser = await chromium.launch({ headless: false, slowMo: 200 });
const salvar = async (page, nome) => {
  fs.writeFileSync(`recon/${nome}.html`, await page.locator('body').innerHTML());
  await page.screenshot({ path: `recon/${nome}.png` });
  console.log(`Salvo: recon/${nome}.html e recon/${nome}.png`);
};
try {
  const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await entrar(page, usuario, senha);

  // menu: Relatório > (algum) Call Center > Discador — mesmo método de abrirChamadasManuais
  const link = page.getByRole('link', { name: 'Discador', exact: true });
  const visivel = () => link.first().isVisible().catch(() => false);
  if (!(await visivel())) {
    await page.getByText('Relatório', { exact: true }).first().click();
    const grupos = page.getByText('Call Center', { exact: true });
    for (let i = (await grupos.count()) - 1; i >= 0 && !(await visivel()); i--) {
      await grupos.nth(i).click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  console.log(`Links "Discador" visíveis: ${await link.count()}`);
  if (!(await visivel())) { await salvar(page, 'discador-menu'); throw new Error('não achei o link "Discador" no menu'); }
  await link.first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Filtros').first().click();
  await page.waitForTimeout(1500);
  await salvar(page, 'discador-filtros');

  // cada "Selecione" com o rótulo mais próximo e as opções que aparecem ao clicar
  const caixas = page.getByRole('textbox', { name: 'Selecione' });
  const n = await caixas.count();
  console.log(`Campos "Selecione": ${n}`);
  for (let i = 0; i < n; i++) {
    const rotulo = await caixas.nth(i).evaluate((e) => {
      const ignorar = new Set(['', 'Selecione', 'keyboard_arrow_down']);
      let el = e;
      for (let k = 0; k < 6 && el; k++, el = el.parentElement) {
        const linhas = (el.innerText || '').split('\n').map((x) => x.trim()).filter((x) => !ignorar.has(x));
        if (linhas.length) return linhas[0].slice(0, 40);
      }
      return '(sem rótulo)';
    });
    const antes = new Set(await page.getByRole('button').allInnerTexts());
    await caixas.nth(i).click().catch(() => {});
    await page.waitForTimeout(800);
    const depois = (await page.getByRole('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && !antes.has(t));
    console.log(`  #${i}: ${rotulo} → ${depois.length} opções${depois.length ? ': ' + depois.slice(0, 40).join(' | ') : ''}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // período: texto "dd/mm/aaaa hh:mm - dd/mm/aaaa hh:mm" (igual ao das manuais?) e o seletor que ele abre
  const periodo = page.getByText(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/).first();
  if (await periodo.isVisible().catch(() => false)) {
    console.log(`Período na tela: "${((await periodo.innerText()) || '').replace(/\s+/g, ' ').trim()}"`);
    await periodo.click();
    await page.waitForTimeout(1000);
    await salvar(page, 'discador-calendario');
    console.log(`Seletor .daterangepicker: ${await page.locator('.daterangepicker').count()} | campos de hora: ${await page.locator('.daterangepicker select, .daterangepicker input').count()}`);
  } else {
    console.log('Não achei o período no formato das manuais; ver recon/discador-filtros.png.');
  }
  console.log('Botões Buscar/Exportar:', await page.getByRole('button', { name: /Buscar$/ }).count(), await page.getByRole('button', { name: /Exportar$/ }).count());
} finally {
  await browser.close();
}
