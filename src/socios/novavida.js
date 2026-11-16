// src/socios/novavida.js — navegação no Congonhas (Nova Vida TI). §156, spec seções 3 e 5.3.
// Só navega e devolve TEXTO BRUTO; quem interpreta é ler-socios.js. Nunca loga nada.
// Cada navegador é dono de UMA página (const): depois de um tempo esgotado o main fecha este e pede outro,
// e a consulta velha que ainda estiver rodando só consegue falhar na página fechada.
import { LINHA_CPF_FONTE } from './ler-socios.js';

const INICIO = 'https://congonhas.novavidatec.com.br/';
const HOST = 'congonhas.novavidatec.com.br';
const BUSCA = 'Digite o CPF ou CNPJ';

// Mesma regra de CPF do ler-socios.js (linha só com dígitos/pontos/traço e 11 dígitos), para testar fora da página.
export function cartaoTemCpf(texto, fonte = LINHA_CPF_FONTE) {
  const re = new RegExp(fonte);
  return String(texto ?? '').split('\n').some((l) => { const x = l.trim(); return re.test(x) && x.replace(/\D/g, '').length === 11; });
}
// Roda no navegador (não enxerga o módulo): marca os cartões de sócio = menor elemento com uma linha de CPF e "Participação".
function marcarCartoesNaPagina(fonte) {
  const re = new RegExp(fonte);
  const temCpf = (t) => t.split('\n').some((l) => { const x = l.trim(); return re.test(x) && x.replace(/\D/g, '').length === 11; });
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
  const page = await context.newPage();
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
    // Navegador novo na mesma sessão (cookies do contexto): só vai para a tela de busca.
    async irParaBusca() {
      await page.goto(INICIO, { waitUntil: 'networkidle', timeout: 45000 });
      await page.getByPlaceholder(BUSCA).first().waitFor({ state: 'visible', timeout: 20000 });
    },
    // Falha (lança) se a empresa não abrir: tempo esgotado NÃO pode virar "sem sócios".
    async buscarCnpj(cnpj) {
      const antes = page.url();
      const caixa = page.getByPlaceholder(BUSCA).first();
      await caixa.fill('');
      await caixa.pressSequentially(cnpj, { delay: 30 }); // a máscara do campo formata sozinha
      await caixa.press('Enter');
      await page.waitForURL((u) => u.href !== antes && /\/Pj\/Cadastro/i.test(u.pathname), { timeout: 20000 });
    },
    async abrirSocios() {
      await page.locator('a', { hasText: /^\s*Sócios\s*$/ }).first().click({ timeout: 10000 });
      await page.waitForURL(/\/Pj\/Socios/i, { timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    },
    async lerCartoes() {
      return page.evaluate(marcarCartoesNaPagina, LINHA_CPF_FONTE);
    },
    async lerPessoa(indice) {
      const socios = page.url();
      await page.evaluate(marcarCartoesNaPagina, LINHA_CPF_FONTE); // a página pode ter sido redesenhada ao voltar
      await page.locator(`[data-apex-socio="${indice}"]`).locator('button, a').first().click({ timeout: 10000 });
      await page.waitForURL(/\/Pf\/Cadastro/i, { timeout: 20000 });
      await page.getByText('Celulares', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const fixos = await page.evaluate(secaoNaPagina, ['Telefones fixos', 'Celulares']);
      const celulares = await page.evaluate(secaoNaPagina, ['Celulares', 'Telefones fixos']);
      await page.goBack({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      if (!/\/Pj\/Socios/i.test(page.url())) await page.goto(socios, { waitUntil: 'networkidle', timeout: 20000 });
      return { fixos, celulares };
    },
    async fechar() {
      await page.close();
    },
  };
  return nav;
}
