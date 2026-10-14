// test/fixtureDiscador.js — planilha FALSA com o layout real do dialer_calls_report (50 colunas, nomes repetidos).
// Nenhum dado real: telefones 119000000xx, CNPJ 000000000001xx, nomes ZZ.
import XLSX from 'xlsx';

export const CABECALHO_DISCADOR = [
  'ID', 'Cód. Campanha', 'Cód. Carga', 'Cód. Dado Carga', 'Cód.Contato', 'Telefone', 'Tentativa', 'Posição', 'Região',
  'Status', 'Status Discagem', 'Fila', 'Gravacao', 'Opção URA', 'Dt/Hr Início', 'Data/Hora Atendida',
  'Data/Hora Atendimento', 'Data/Hora Fim', 'Tempo_Espera', 'Tempo_Total', 'Tempo_Chamada', 'Tempo Total',
  'ID do Usuário', 'Canal', 'Canal Agente', 'UniqueID', 'Cód. Fila', 'Cod Empresa', 'Nome Fila', 'DataHora_Geracao',
  'DataHora_Atendimento', 'DataHora_Conectado', 'DataHora_Fim', 'UniqueID', 'Campanha', 'Carga', 'URA', 'Nome/Desc',
  'Tranferida', 'Dest. Transf.', 'Última Tabulação', 'Agent Records', 'Documento 1', 'Documento 2', 'Integração 1',
  'Integração 2', 'Campo 1', 'Campo 2', 'Campo 3', 'Região',
];

// Linha atendida completa; `extra` sobrescreve por ÍNDICE de coluna (os nomes se repetem).
export function linhaDiscador(extra = {}) {
  const v = Array(CABECALHO_DISCADOR.length).fill(null);
  const set = (nome, val, ocorrencia = 0) => {
    let idx = -1;
    for (let i = 0, n = 0; i < CABECALHO_DISCADOR.length; i++) {
      if (CABECALHO_DISCADOR[i] === nome) { if (n === ocorrencia) { idx = i; break; } n++; }
    }
    v[idx] = val;
  };
  set('ID', 244000001); set('Cód. Campanha', 270); set('Cód. Carga', 14162); set('Telefone', 11900000001);
  set('Status', 'ANSWERED'); set('Gravacao', '1003/2026/10/02/DIALER-1');
  set('Dt/Hr Início', '2026-10-02 18:14:20'); set('Data/Hora Fim', '2026-10-02 18:16:00');
  set('Tempo_Espera', '00:00:02'); set('Tempo_Total', '00:01:40'); set('Tempo_Chamada', '00:01:28'); set('Tempo Total', '100');
  set('ID do Usuário', 189); set('Canal', 'Local/11900000001@campaign'); set('UniqueID', '1.1', 0);
  set('DataHora_Geracao', '02/10/2026 15:14:20'); set('DataHora_Conectado', '02/10/2026 15:14:30');
  set('DataHora_Atendimento', '02/10/2026 15:14:32'); set('DataHora_Fim', '02/10/2026 15:16:00');
  set('Campanha', 'ZZ-CAMPANHA'); set('Carga', 'ZZ-CARGA'); set('Nome/Desc', 'ZZ FULANO DE TAL');
  set('Última Tabulação', 'SEM AVANÇO'); set('Documento 1', 11122233344); set('Documento 2', 101);
  set('Campo 1', 'ZZ-OPERADORA'); set('Campo 2', 'MEI'); set('Campo 3', 'ZZCIDADE');
  set('Região', null, 0); set('Região', 'SUDESTE', 1);
  for (const [k, val] of Object.entries(extra)) v[Number(k)] = val;
  return v;
}
export const COL = Object.fromEntries(CABECALHO_DISCADOR.map((n, i) => [n, i]).reverse()); // primeira ocorrência vence
COL['Região#2'] = CABECALHO_DISCADOR.lastIndexOf('Região');

export function planilhaDiscador(linhas) {
  const ws = XLSX.utils.aoa_to_sheet([CABECALHO_DISCADOR, ...linhas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
