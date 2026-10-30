# CTX 2.0 — instruções para o Claude

Software interno da CTX Stands & Cenografia para acompanhar o Planejamento Estratégico:
cadeia Projeto Estratégico → Meta → Colaborador → Indicador + Processos. Interface em português do Brasil.
O dono do projeto (Miguel) não é programador: explique mudanças em linguagem simples.

## Arquitetura
- `src/` — frontend React 19 + Vite + TypeScript + Tailwind + shadcn/ui. Cliente da API em `src/lib/pocketbase/client.ts`.
- `backend/pb_hooks/*.pb.js` — rotas e rotinas do PocketBase (JSVM/goja, sintaxe ES2015+ sem módulos ESM).
  - `admin_users.pb.js` — contas, primeiro acesso, redefinição de senha.
  - `fluxograma.pb.js` — salvar/limpar posições do diagrama.
  - `rotina.pb.js` — avaliações, pulsos, comentários, administração dos ciclos, exportação CSV e o job diário `rotina_ciclos_automation` (06:00 UTC).
- `backend/pb_migrations/` — estrutura do banco. `backend/pb_schema.json` é só referência (gerado pelo Skip).
- `Dockerfile` + `deploy/start.sh` — uma única imagem: PocketBase serve a API e o frontend compilado (`pb_public`). Dados em `/pb/pb_data` (volume).
- Hospedagem: Fly.io, app `ctx-2-0`, região `gru` (`fly.toml`). Publicação pelo GitHub Actions (`.github/workflows/publicar.yml`) a cada push na `main`, com o segredo `FLY_API_TOKEN` (deploy token do Fly). Detalhes em `HOSPEDAGEM.md`.
- PocketBase fixado em `PB_VERSION` no Dockerfile. Atualize de propósito, lendo o changelog.

## Regras
- Mudança de estrutura do banco (coleção, campo, regra de acesso, índice) = nova migração numerada em `backend/pb_migrations` (ex.: `0011_...js`). Nunca editar migrações já aplicadas.
- Em handlers de `cronAdd` use `$app` (o handler não recebe argumento) e declare funções auxiliares dentro do handler.
- Datas do PocketBase vêm como `2026-10-26 23:59:59.000Z`: troque o espaço por `T` antes de `new Date()` no JSVM.
- Nunca colocar senhas, tokens ou dados pessoais no repositório.
- Cores do farol sempre com rótulo em texto; "Atenção" em âmbar `#F59E0B` (diferente do amarelo da marca `#FFD400`).
- Teste local: baixar o binário do PocketBase da mesma versão, `./pocketbase serve --dir=./pb_data --hooksDir=backend/pb_hooks --migrationsDir=backend/pb_migrations` e, em outro terminal, `pnpm dev` com `VITE_POCKETBASE_URL=http://127.0.0.1:8090`.
