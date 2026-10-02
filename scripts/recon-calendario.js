// scripts/recon-calendario.js
// DIAGNÓSTICO (não faz parte do robô): entra no ProContact, abre Chamadas Manuais > Filtros > seletor de Período e
// salva em recon/ o HTML e uma imagem da tela, para mapear o calendário. NÃO clica em Buscar: nenhum telefone/
// dado de cliente aparece. Usuário/senha vêm de variáveis de ambiente (digitadas por você, nunca no chat).
//   $env:PROCONTACT_URL="https://eaglesales.procontact.com.br/pages/login"; $env:PROCONTACT_USUARIO="<conta>"
//   $s = Read-Host "Senha" -AsSecureString; $env:PROCONTACT_SENHA=[Net.NetworkCredential]::new('',$s).Password
//   node scripts/recon-calendario.js
import fs from 'node:fs';
import { chromium } from 'playwright';
import { entrar, abrirChamadasManuais } from '../src/procontact.js';

const { PROCONTACT_URL, PROCONTACT_USUARIO, PROCONTACT_SENHA } = process.env;
if (!PROCONTACT_URL || !PROCONTACT_USUARIO || !PROCONTACT_SENHA) { console.error('Defina PROCONTACT_URL, PROCONTACT_USUARIO e PROCONTACT_SENHA.'); process.exit(1); }

fs.mkdirSync('recon', { recursive: true });
const browser = await chromium.launch({ headless: false, slowMo: 250 });
try {
  const page = await (await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(PROCONTACT_URL, { waitUntil: 'domcontentloaded' });
  await entrar(page, PROCONTACT_USUARIO, PROCONTACT_SENHA);
  await abrirChamadasManuais(page);

  // 1) quais filtros "Selecione" existem, na ordem (a gravação clicou no 5º e escolheu "AQUISIÇÃO - CLARO")
  const caixas = page.getByRole('textbox', { name: 'Selecione' });
  const n = await caixas.count();
  console.log(`Campos "Selecione": ${n}`);
  for (let i = 0; i < n; i++) {
    const rotulo = await caixas.nth(i).evaluate((e) => {
      let el = e;
      for (let k = 0; k < 4 && el; k++, el = el.parentElement) { const t = (el.innerText || '').trim().split('\n')[0]; if (t && t !== 'Selecione') return t.slice(0, 40); }
      return '(sem rótulo)';
    });
    console.log(`  #${i}: ${rotulo}`);
  }

  // 2) abre o seletor de período (o texto "dd/mm/aaaa hh:mm - dd/mm/aaaa hh:mm") e salva o HTML
  await page.getByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} - \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/).first().click();
  await page.waitForTimeout(1000);
  fs.writeFileSync('recon/calendario.html', await page.locator('body').innerHTML());
  await page.screenshot({ path: 'recon/calendario.png' });
  console.log('Salvo: recon/calendario.html e recon/calendario.png (abra e confira antes de mandar qualquer coisa).');
} finally {
  await browser.close();
}
