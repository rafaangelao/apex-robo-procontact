// scripts/prompt.js — pergunta no terminal; com oculto=true a digitação aparece como *
import readline from 'node:readline';

export function perguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = (s) => { process.stdout.write(s.includes(texto) ? s : '*'); };
    rl.question(texto, (r) => { rl.close(); if (oculto) process.stdout.write('\n'); resolve(r); });
  });
}
