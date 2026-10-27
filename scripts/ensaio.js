// scripts/ensaio.js
// ENSAIO LOCAL, SÓ LEITURA: faz o caminho completo no ProContact (período + equipe + Buscar + Exportar), lê o Excel
// e imprime SOMENTE contagens. Não envia nada ao banco e não grava arquivo (a pasta temporária é apagada no fim).
// Uso:  node scripts/ensaio.js     (pergunta usuário e senha; a senha é digitada oculta)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { perguntar } from './prompt.js';
import { exportarRelatorio } from '../src/procontact.js';
import { periodoDoRelatorio, formatarTela } from '../src/periodo.js';
import { lerPlanilha, parseRelatorio } from '../src/parse.js';
import { EQUIPE_PADRAO } from '../src/main.js';

const url = process.env.PROCONTACT_URL || (await perguntar('Endereço de login do ProContact: ')).trim();
const usuario = process.env.PROCONTACT_USUARIO || (await perguntar('Usuário do ProContact: ')).trim();
const senha = process.env.PROCONTACT_SENHA || (await perguntar('Senha (oculta): ', true));
const periodo = periodoDoRelatorio();
const equipe = process.env.EQUIPE || EQUIPE_PADRAO;
console.log(`Período pedido: ${formatarTela(periodo)} | equipe: ${equipe}`);

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ensaio-'));
try {
  const arquivo = await exportarRelatorio({ url, usuario, senha, periodo, equipe, pasta });
  const p = parseRelatorio(lerPlanilha(fs.readFileSync(arquivo)));
  const datas = p.linhas.map((l) => l.gerada_em).sort();
  console.log({
    lidas: p.lidas, validas: p.linhas.length, invalidas: p.invalidas, ignoradasEagle: p.ignoradasEagle, faltando: p.faltando,
    primeira: datas[0], ultima: datas[datas.length - 1],
    atendidas: p.linhas.filter((l) => l.atendida).length, usuariosDistintos: new Set(p.linhas.map((l) => l.usuario)).size,
  });
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}
