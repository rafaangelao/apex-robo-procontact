// src/socios/novavida.js — navegação no Congonhas (Nova Vida TI). §155, spec seções 3 e 5.3.
// Só navega e devolve TEXTO BRUTO; quem interpreta é ler-socios.js. Nunca loga nada.
const INICIO = 'https://congonhas.novavidatec.com.br/';
const HOST = 'congonhas.novavidatec.com.br';
const BUSCA = 'Digite o CPF ou CNPJ';

// Roda no navegador: marca os cartões de sócio (menor elemento com CPF de 11 dígitos numa linha e "Participação").
function marcarCartoesNaPagina() {
  const temCpf = (t) => /(^|\n)\s*\d{11}\s*(\n|$)/.test(t);
  const todos = [...document.querySelectorAll('body *')]
    .filter((e) => { const t = e.innerText || ''; return t.includes('Participação') && temCpf(t); });
  const minimos = todos.filter((e) => !todos.some((o) => o !== e && e.contains(o)));
  document.querySelectorAll('[data-apex-socio]').forEach((e) => e.removeAttribute('data-apex-socio'));
  return minimos.map((e, i) => { e.setAttribute('data-apex-socio', String(i)); return e.innerText; });
}
// Roda no navegador: texto da seção cujo título é exatamente `titulo` (sobe até antes de englobar `outro`).
function secaoNaPagina([titulo, outro]) {
  const h = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === titulo);
  if (!h) return null;
  let el = h;
  while (el.parentElement && el.parentElement !== document.body && !(el.parentElement.innerText || '').includes(outro)) el = el.parentElement;
  return el.innerText;
}

export async function criarNavegador(context) {
  let page = await context.newPage();
  const nav = {
    async entrar({ usuario, senha, cliente }) {
      // Entrar pelo Congonhas: ele redireciona ao login com o token p=… (direto no /Auth/Login dá "Sessão expirada")
      await page.goto(INICIO, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForSelector('#sUsuario', { timeout: 20000 });
      await page.fill('#sUsuario', usuario);
      await page.fill('#sSenha', senha);
      await page.fill('#sCliente', cliente);
      await page.mouse.move(400, 300);
      await page.waitForTimeout(2500); // o reCAPTCHA v3 dá nota melhor a quem "fica" na página
      await page.click('#submitEntrar');
      await page.waitForURL((u) => u.hostname === HOST, { timeout: 30000 });
      await page.getByPlaceholder(BUSCA).first().waitFor({ state: 'visible', timeout: 20000 });
    },
    async buscarCnpj(cnpj) {
      const antes = page.url();
      const caixa = page.getByPlaceholder(BUSCA).first();
      await caixa.fill('');
      await caixa.pressSequentially(cnpj, { delay: 30 }); // a máscara do campo formata sozinha
      await caixa.press('Enter');
      try {
        await page.waitForURL((u) => u.href !== antes && /\/Pj\/Cadastro/i.test(u.pathname), { timeout: 20000 });
        return true;
      } catch { return false; }
    },
    async abrirSocios() {
      await page.locator('a', { hasText: /^\s*Sócios\s*$/ }).first().click({ timeout: 10000 });
      try { await page.waitForURL(/\/Pj\/Socios/i, { timeout: 15000 }); } catch { return false; }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      return true;
    },
    async lerCartoes() {
      return page.evaluate(marcarCartoesNaPagina);
    },
    async lerPessoa(indice) {
      const socios = page.url();
      await page.evaluate(marcarCartoesNaPagina); // a página pode ter sido redesenhada ao voltar
      await page.locator(`[data-apex-socio="${indice}"]`).locator('button, a').first().click({ timeout: 10000 });
      await page.waitForURL(/\/Pf\/Cadastro/i, { timeout: 20000 });
      await page.getByText('Celulares', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const fixos = await page.evaluate(secaoNaPagina, ['Telefones fixos', 'Celulares']);
      const celulares = await page.evaluate(secaoNaPagina, ['Celulares', 'Telefones fixos']);
      await page.goBack({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      if (!/\/Pj\/Socios/i.test(page.url())) await page.goto(socios, { waitUntil: 'networkidle', timeout: 20000 });
      return { fixos, celulares };
    },
    // Depois de um timeout: descarta a página (a consulta velha pode continuar rodando nela) e abre outra na mesma sessão.
    async reiniciar() {
      await page.close().catch(() => {});
      page = await context.newPage();
      await page.goto(INICIO, { waitUntil: 'networkidle', timeout: 45000 });
      await page.getByPlaceholder(BUSCA).first().waitFor({ state: 'visible', timeout: 20000 });
    },
  };
  return nav;
}
