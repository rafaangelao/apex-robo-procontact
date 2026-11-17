// test/socios-ler.test.js — DADOS FICTÍCIOS (repo público)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCartaoSocio, ordenarSocios, lerTelefones, paraResultado, TETO_TELEFONES } from '../src/socios/ler-socios.js';

const cartao = (nome, cpf, pct, extra = '') => `${extra}${nome}\n${cpf}\nParticipação\n${pct}\nParticipação em empresas`;

test('lerCartaoSocio: nome em duas linhas, CPF só dígitos, participação com ponto', () => {
  assert.deepEqual(lerCartaoSocio(cartao('ZZ SOCIA\nUM DE TAL', '12345678909', '50.00%'), 0),
    { indice: 0, nome: 'ZZ SOCIA UM DE TAL', cpf: '12345678909', participacao: 50 });
});
test('lerCartaoSocio: ignora linha de ícone e aceita CPF formatado e vírgula', () => {
  assert.deepEqual(lerCartaoSocio(cartao('ZZ SOCIO DOIS', '123.456.789-09', '33,33%', 'person_search\n'), 1),
    { indice: 1, nome: 'ZZ SOCIO DOIS', cpf: '12345678909', participacao: 33.33 });
});
test('lerCartaoSocio: sem participação → null; sem CPF ou sem nome → null', () => {
  assert.equal(lerCartaoSocio('ZZ SEM PCT\n12345678909\nParticipação\nParticipação em empresas', 2).participacao, null);
  assert.equal(lerCartaoSocio('ZZ SEM CPF\nParticipação\n10.00%', 3), null);
  assert.equal(lerCartaoSocio('12345678909\nParticipação\n10.00%', 4), null);
});
test('ordenarSocios: participação desc, nulos no fim, empate pela ordem da página', () => {
  const l = [
    { indice: 0, participacao: 10 }, { indice: 1, participacao: null }, { indice: 2, participacao: 50 }, { indice: 3, participacao: 10 },
  ];
  assert.deepEqual(ordenarSocios(l).map((s) => s.indice), [2, 0, 3, 1]);
});
test('lerTelefones: celular com WhatsApp e operadora em linhas separadas; ignora cabeçalho', () => {
  const t = 'Celulares\nMobilidade cadastral: MEDIA\n(11) 90000-0001\nWHATSAPP\nCLARO\n(11) 90000-0002\nWHATSAPP PROCON\nVIVO';
  assert.deepEqual(lerTelefones(t, 'celular'), [
    { tipo: 'celular', numero: '11900000001', operadora: 'CLARO', whatsapp: true },
    { tipo: 'celular', numero: '11900000002', operadora: 'VIVO', whatsapp: true },
  ]);
});
test('lerTelefones: fixo na mesma linha da operadora, sem WhatsApp', () => {
  assert.deepEqual(lerTelefones('Telefones fixos\nMobilidade cadastral: BAIXA\n(11) 3000-0001 VIVO', 'fixo'),
    [{ tipo: 'fixo', numero: '1130000001', operadora: 'VIVO', whatsapp: false }]);
});
test('lerTelefones: seção ausente ou sem número → []; corta em 10', () => {
  assert.deepEqual(lerTelefones(null, 'fixo'), []);
  assert.deepEqual(lerTelefones('Celulares\nNenhum registro', 'celular'), []);
  const muitos = Array.from({ length: 12 }, (_, i) => `(11) 90000-00${String(i).padStart(2, '0')}`).join('\n');
  assert.equal(lerTelefones(muitos, 'celular').length, 10);
});
test('paraResultado: tira o indice e mantém o formato da spec', () => {
  assert.deepEqual(paraResultado({ indice: 3, nome: 'ZZ', cpf: '12345678909', participacao: null, telefones_consultados: false, telefones: [] }),
    { nome: 'ZZ', cpf: '12345678909', participacao: null, telefones_consultados: false, telefones: [] });
  assert.equal(TETO_TELEFONES, 5);
});
test('cartaoTemCpf (usado na página): aceita CPF só dígitos e formatado, como lerCartaoSocio', async () => {
  const { cartaoTemCpf } = await import('../src/socios/novavida.js');
  assert.equal(cartaoTemCpf('ZZ\n12345678909\nParticipação'), true);
  assert.equal(cartaoTemCpf('ZZ\n123.456.789-09\nParticipação'), true);
  assert.equal(cartaoTemCpf('ZZ\n50.00%\nParticipação'), false);
  assert.equal(cartaoTemCpf('ZZ\n(11) 90000-0001'), false);
});
test('lerCartaoSocio: formato real do Congonhas (mapeado 17/11): ícones antes e depois do CPF, linhas vazias, vírgula', () => {
  const t = 'account_circle\nZZ SOCIA DO TESTE\n12345678909\nmanage_search\n\nParticipação\n\n50,00%\n\nParticipação em empresas';
  assert.deepEqual(lerCartaoSocio(t, 0), { indice: 0, nome: 'ZZ SOCIA DO TESTE', cpf: '12345678909', participacao: 50 });
});
test('lerTelefones: formato real do Congonhas (mapeado 17/11): ícones de avaliação e rodapé não atrapalham', () => {
  const ic = '\tthumb_up thumb_down person_search';
  const fixos = `call\nTelefones fixos\nMobilidade cadastral: MEDIA\n\n(11) 3000-0001\n\nVIVO\n${ic}`;
  const cel = `ad_units\nCelulares\nMobilidade cadastral: MEDIA\n\n(11) 90000-0001\nWHATSAPP\n\nCLARO\n${ic}\n\n\n(11) 90000-0002\nWHATSAPP\nPROCON\n\nCLARO\n${ic}\n\n\n(11) 90000-0003\n\nTIM\n${ic}\nver todos\n3`;
  assert.deepEqual(lerTelefones(fixos, 'fixo'), [{ tipo: 'fixo', numero: '1130000001', operadora: 'VIVO', whatsapp: false }]);
  assert.deepEqual(lerTelefones(cel, 'celular'), [
    { tipo: 'celular', numero: '11900000001', operadora: 'CLARO', whatsapp: true },
    { tipo: 'celular', numero: '11900000002', operadora: 'CLARO', whatsapp: true },
    { tipo: 'celular', numero: '11900000003', operadora: 'TIM', whatsapp: false },
  ]);
});
