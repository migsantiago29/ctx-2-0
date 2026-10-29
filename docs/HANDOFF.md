# CTX 2.0 — Passagem de bastão (28/out/2026)

Contexto para novas sessões do Claude Code. Leia junto com `CLAUDE.md` e `HOSPEDAGEM.md`.

## Situação
- O CTX 2.0 foi criado no Skip (Adapta) e saiu de lá em 27–28/out/2026 para cortar o custo de R$ 250/mês.
- Hoje roda no **Fly.io**, app `ctx-2-0`, região São Paulo, 1 máquina 512 MB sempre ligada + volume `pb_data` de 1 GB (~US$ 4/mês).
- Endereço: https://ctx-2-0.fly.dev (painel técnico do PocketBase em `/_/`).
- Publicação: integração GitHub do próprio Fly.io (o Miguel conectou pelo dashboard). IPs públicos atribuídos manualmente: IPv4 compartilhado + IPv6 dedicado (ambos gratuitos).
- Superusuário do painel criado no primeiro boot a partir das variáveis `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` (variáveis de ambiente no Fly, visíveis no dashboard — trocar a senha pelo painel).
- O app está no ar e o login funciona, mas **o banco está vazio**: os dados ainda não foram importados.
- **Prazo: o Skip renova em 31/10/2026 — cancelar até sexta, 30/10.** Ninguém da equipe usa o app ainda.

## O que já foi feito no código (commits cd8f414 em diante)
1. Backend consolidado em `backend/` (hooks `*.pb.js` + migrações); pasta `pocketbase/` do Skip removida.
2. Job diário `rotina_ciclos_automation` corrigido — no Skip ele nunca funcionou (handler usava `e.app`, datas não eram lidas, ciclo aberto pelo job não notificava).
3. Migração `0010`: colaborador não consegue mais se promover a admin; só admin cria/exclui contas; Miguel é obrigado a trocar a senha no primeiro login.
4. Removido: script do Skip, arquivos exclusivos do Skip, cadastro público (`/signup`), login pré-preenchido com a senha de demonstração `Skip@Pass`.
5. `Dockerfile` + `deploy/start.sh` + `fly.toml`: uma imagem com PocketBase 0.40.6 servindo API e telas.
6. Migração `0011`: reaplica as regras da `0010` na coleção `users`. O PocketBase roda as migrações em ordem alfabética e `updated_users.js` (sem número) rodava depois da `0010`, desfazendo a proteção (testado com 0.40.6: sem a `0011` o colaborador vira admin; com ela, recebe 404).
Tudo testado localmente com PocketBase 0.40.6 (exceto o build do frontend, testado no próprio Fly).

## Próximos passos (para cancelar o Skip)
1. Painel `/_/`: Settings → Application (nome e URL `https://ctx-2-0.fly.dev`); trocar a senha do superusuário; Settings → Backups automáticos diários (manter 7).
2. App: entrar como `miguel.santiago@ctxcenografia.com.br` com a senha de demonstração `Skip@Pass` (criada pela migração 0002, não é a senha pessoal do Skip) → trocar a senha. Fazer **antes** da importação: ela marca a conta do Miguel como "não precisa trocar".
3. Administração → Importação: Etapa 1 (`01_areas`, `02_colaboradores`, `04_processos`) e Etapa 2 (`03_projetos_estrategicos`, `05_metas`, `06_indicadores`). Os CSVs estão no computador do Miguel, pastas `Skip_Etapa_B1` e `Skip_Etapa_B2`. Conferir o relatório: 14 áreas, 22 colaboradores/contas, 181 processos, 217 conexões, 5 projetos, 80 metas, 225 indicadores, 84 vínculos meta-responsável, 86 meta-processo.
4. Testes (só depois que a `0011` estiver publicada; conferir em `/_/` → Collections → users → API Rules que *Create rule* é só `@request.auth.role = 'admin'`): login de 2 colegas com `CTX@2027` (troca obrigatória), Meu Painel, Fluxograma, Organograma, Projetos, Pulso CTX; painel → Settings → Crons → rodar `rotina_ciclos_automation`; instalar no celular.
5. Pergunta em aberto: o Miguel organizou à mão as posições das caixas do Fluxograma no Skip? Se sim, baixar a "Exportação completa" do Skip antes de cancelar e restaurar `fluxograma_posicoes`.
6. Limpeza: apagar os 3 segredos antigos do GitHub (FLY_API_TOKEN, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD) e o token criado no Fly; apagar a branch `flyio-new-files`; conferir em Fly → Activity se um push na `main` gera nova publicação.
7. Cancelar o Skip (renova em 31/10).

## Melhorias para depois (não bloqueiam o cancelamento)
- Regras de acesso: hoje qualquer usuário logado pode criar/editar/excluir áreas, colaboradores, processos, projetos, metas e indicadores pela API — restringir a admin com nova migração, testando as telas de importação.
- Lembrete automático 2 dias antes do fechamento do ciclo (previsto na especificação; hoje só existe o botão "Lembrar pendentes").
- Endereço próprio (`ctx2.ctxcenografia.com.br`) — depende do acesso ao DNS do domínio.
- E-mail (SMTP) quando os colaboradores tiverem e-mails reais.
- Cópia de backup fora do Fly (ex.: armazenamento S3).
- Num banco criado do zero (teste local), `updated_users.js` ainda roda depois da `0011` e volta às regras antigas. No Fly não acontece (ela já rodou). Resolver de vez exige decidir o que fazer com esse arquivo sem número.
