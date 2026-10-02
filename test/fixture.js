// test/fixture.js
// Planilhas FALSAS em memória (nunca em arquivo; nenhum dado real)
import XLSX from 'xlsx';

// Mesmo cabeçalho do relatório MANUALCALL_REPORT (inclui "UniqueID" duas vezes).
export const CABECALHO = ['ID', 'UniqueID', 'Cod Integração', 'Campanha', 'Telefone', 'Status', 'Status Discagem', 'Protocolo 1', 'Protocolo 2', 'Usuario', 'DataHora_Geracao', 'DataHora_Atendimento', 'DataHora_Fim', 'Tempo_Total', 'Tempo_Chamada', 'Empresa', 'Canal', 'Gravacao', 'UniqueID', 'Última Tabulação', 'Transferido', 'Destino Transf.', 'TelefoneBr'];

const padrao = {
  ID: '1001', UniqueID: '1759000001.1', 'Cod Integração': null, Campanha: '-', Telefone: '11900000001', Status: 'ANSWERED',
  'Status Discagem': 'ANSWER', 'Protocolo 1': null, 'Protocolo 2': null, Usuario: 'apex.fulano', DataHora_Geracao: '01/10/2026 12:20:59',
  DataHora_Atendimento: '01/10/2026 12:21:10', DataHora_Fim: '01/10/2026 12:22:25', Tempo_Total: '00:01:26', Tempo_Chamada: '00:01:15',
  Empresa: 'EMPRESA TESTE', Canal: 'SIP/Teste', Gravacao: '2026/10/01/MANUAL-1001', 'Última Tabulação': 'RETORNO', Transferido: null,
  'Destino Transf.': '-', TelefoneBr: '(11) 90000-0001',
};

export function linha(sobre = {}) {
  const v = { ...padrao, ...sobre };
  return CABECALHO.map((c, i) => (c === 'UniqueID' && i === 18 ? v.UniqueID2 ?? '1759000001' : v[c] ?? null));
}

export function planilha(linhas) {
  const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
