// scripts/ensaio-discador.js
// ENSAIO LOCAL, SÓ LEITURA, do relatório do DISCADOR: faz o caminho completo no ProContact (período ontem+hoje +
// campanhas + Buscar + Exportar), lê o Excel e imprime SOMENTE contagens (por campanha e por status). Não envia nada
// ao banco e não grava arquivo (a pasta temporária é apagada no fim).
// Uso:  node scripts/ensaio-discador.js     (pergunta usuário e senha; a senha é digitada oculta)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { perguntar } from './prompt.js';
import { exportarDiscador } from '../src/procontact.js';
import { periodoDiscador, formatarTela } from '../src/periodo.js';
import { lerPlanilha } from '../src/parse.js';
import { parseDiscador } from '../src/parseDiscador.js';
import { prefixosCampanhas } from '../src/discador.js';

const url = process.env.PROCONTACT_URL || (await perguntar('Endereço de login do ProContact: ')).trim();
const usuario = process.env.PROCONTACT_USUARIO || (await perguntar('Usuário do ProContact: ')).trim();
const senha = process.env.PROCONTACT_SENHA || (await perguntar('Senha (oculta): ', true));
const periodo = periodoDiscador();
const campanhas = prefixosCampanhas(process.env.DISCADOR_CAMPANHAS);
console.log(`Período pedido: ${formatarTela(periodo)} | campanhas que começam com: ${campanhas.join(', ')}`);

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ensaio-discador-'));
try {
  const arquivo = await exportarDiscador({ url, usuario, senha, periodo, campanhas, pasta, log: (m) => console.log('  ' + m) });
  const p = parseDiscador(lerPlanilha(fs.readFileSync(arquivo)));
  const conta = (f) => p.linhas.reduce((m, l) => (m[f(l)] = (m[f(l)] || 0) + 1, m), {});
  const datas = p.linhas.map((l) => l.gerada_em).sort();
  console.log({
    lidas: p.lidas, validas: p.linhas.length, invalidas: p.invalidas, faltando: p.faltando,
    primeira: datas[0], ultima: datas[datas.length - 1],
    porCampanha: conta((l) => l.campanha || '(sem campanha)'), porStatus: conta((l) => l.status),
    atendidasComAgente: p.linhas.filter((l) => l.status === 'ANSWERED' && l.agente_id != null).length,
    agentes: [...new Set(p.linhas.map((l) => l.agente_id).filter((x) => x != null))].sort((a, b) => a - b).join(','),
  });
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}
