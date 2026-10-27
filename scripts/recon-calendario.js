// scripts/recon-calendario.js
// DIAGNÓSTICO (não faz parte do robô): entra no ProContact, abre Chamadas Manuais > Filtros > seletor de Período e
// salva em recon/ o HTML e uma imagem da tela, para mapear o calendário. NÃO clica em Buscar: nenhum telefone/
// dado de cliente aparece. Uso:  node scripts/recon-calendario.js
// O script PERGUNTA o usuário e a senha no terminal (a senha é digitada oculta; nada vai para arquivo, histórico
// ou chat). Se existirem as variáveis PROCONTACT_USUARIO / PROCONTACT_SENHA, usa elas em vez de perguntar.
import fs from 'node:fs';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { entrar, abrirChamadasManuais } from '../src/procontact.js';

function perguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = (s) => { process.stdout.write(s.includes(texto) ? s : '*'); };
    rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r); });
  });
}
const PROCONTACT_URL = process.env.PROCONTACT_URL || (await perguntar('Endereço de login do ProContact: ')).trim();
const PROCONTACT_USUARIO = process.env.PROCONTACT_USUARIO || (await perguntar('Usuário do ProContact: ')).trim();
const PROCONTACT_SENHA = process.env.PROCONTACT_SENHA || (await perguntar('Senha (oculta): ', true));
if (!PROCONTACT_USUARIO || !PROCONTACT_SENHA) { console.error('Usuário e senha são obrigatórios.'); process.exit(1); }

fs.mkdirSync('recon', { recursive: true });
const browser = await chromium.launch({ headless: false, slowMo: 250 });
try {
  const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(PROCONTACT_URL, { waitUntil: 'domcontentloaded' });
  await entrar(page, PROCONTACT_USUARIO, PROCONTACT_SENHA);
  await abrirChamadasManuais(page);

  // 0) salva a tela de filtros ANTES de procurar o período (assim há o que ler mesmo se um passo falhar)
  await page.waitForTimeout(1000);
  fs.writeFileSync('recon/filtros.html', await page.locator('body').innerHTML());
  await page.screenshot({ path: 'recon/filtros.png' });
  console.log('Salvo: recon/filtros.html e recon/filtros.png');

  // 1) quais filtros "Selecione" existem, na ordem (a gravação clicou no 5º e escolheu "AQUISIÇÃO - CLARO")
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
    console.log(`  #${i}: ${rotulo}`);
  }

  // 2) abre o seletor de período e salva o HTML (o texto exato do período é conferido em recon/filtros.html)
  try {
    await page.getByText(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);
    fs.writeFileSync('recon/calendario.html', await page.locator('body').innerHTML());
    await page.screenshot({ path: 'recon/calendario.png' });
    console.log('Salvo: recon/calendario.html e recon/calendario.png');
  } catch (e) {
    console.log('Não achei o texto do período pelo formato; use recon/filtros.html e recon/filtros.png.');
  }
} finally {
  await browser.close();
}
