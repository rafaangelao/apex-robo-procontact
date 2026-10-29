# apex-robo-procontact

Robô que baixa o relatório de **Chamadas Manuais** do ProContact e envia à função `ingest-ligacoes` (Supabase `apex`).
Repositório **público**: nenhum segredo nem dado de cliente no código ou nos logs (endereço, usuário, senha e tokens ficam só nos secrets). Spec e planos: repositório `atmizuta/apex-smart-solutions`, `docs/superpowers/`.

- Roda no GitHub Actions, disparado pelo pg_cron do Supabase (07h–22h, São Paulo): de hora em hora a rodada completa (`robo-procontact-disparo`: manuais do mês + discador) e de 15 em 15 min a rápida (`robo-procontact-rapido`: só as manuais de hoje). Liga/desliga = esses jobs do pg_cron.
- Manual: Actions → "Sincronizar chamadas manuais" → Run workflow → modo `dry` (só confere, não grava) ou `real`; `rapido` = `sim` para só as manuais de hoje.
- Secrets: `PROCONTACT_URL`, `PROCONTACT_USUARIO`, `PROCONTACT_SENHA`, `INGEST_URL`, `INGEST_TOKEN`.
- Testes: `npm test` (não usa navegador nem rede).
- Nunca registrar telefone/usuário em log. Sem screenshots nem traces.
