# apex-robo-procontact

Robô que baixa o relatório de **Chamadas Manuais** do ProContact e envia à função `ingest-ligacoes` (Supabase `apex`).
Repositório **público**: nenhum segredo nem dado de cliente no código ou nos logs (endereço, usuário, senha e tokens ficam só nos secrets). Spec e planos: repositório `atmizuta/apex-smart-solutions`, `docs/superpowers/`.

- Roda no GitHub Actions de hora em hora (07h–22h, seg–sáb, São Paulo). Liga/desliga pela variável de repositório `ROBO_ATIVO` (`true`/vazio).
- Manual: Actions → "Sincronizar chamadas manuais" → Run workflow → modo `dry` (só confere, não grava) ou `real`.
- Secrets: `PROCONTACT_URL`, `PROCONTACT_USUARIO`, `PROCONTACT_SENHA`, `INGEST_URL`, `INGEST_TOKEN`.
- Testes: `npm test` (não usa navegador nem rede).
- Nunca registrar telefone/usuário em log. Sem screenshots nem traces.
