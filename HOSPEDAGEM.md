# CTX 2.0 — Hospedagem própria (Fly.io, São Paulo)

Tudo roda numa única máquina pequena no Fly.io (região `gru`, São Paulo): o PocketBase guarda os dados,
responde à API, executa a rotina diária e entrega as telas do app. Endereço: https://ctx2-cenografia.fly.dev

- `fly.toml` — 1 máquina `shared-cpu-1x` 512 MB sempre ligada + volume `pb_data` de 1 GB em `/pb/pb_data`.
- A publicação é feita pela integração do próprio Fly.io com o GitHub (dashboard → Launch → Deploy from GitHub).

## Segredos (Fly.io → app → Secrets)
| Nome | O que é |
|---|---|
| `PB_ADMIN_EMAIL` | E-mail do superusuário do painel `/_/` |
| `PB_ADMIN_PASSWORD` | Senha forte do superusuário (só vale no primeiro boot; depois, trocar pelo painel) |

## Custo
~US$ 4/mês (máquina 512 MB + 1 GB de volume). Sem escalonamento automático: o valor não cresce sozinho.

## Depois da primeira publicação
1. `https://ctx2-cenografia.fly.dev/_/` → entrar com o superusuário.
2. Settings → Application: nome "CTX 2.0" e URL `https://ctx2-cenografia.fly.dev`.
3. Settings → Backups: backup automático diário (`0 4 * * *`), mantendo os 7 mais recentes.
4. Abrir o app, entrar como `miguel.santiago@ctxcenografia.com.br` (senha antiga do Skip) e trocar a senha (obrigatório).
5. Administração → Importação: importar os 6 CSVs (Etapa 1: 01, 02, 04; Etapa 2: 03, 05, 06) e conferir o relatório.

## Rotina diária
Painel `/_/` → Settings → Crons → `rotina_ciclos_automation` → Run. Só age se a rotina estiver ativada em Administração → Ciclos & Adesão.

## Backups
- Fly.io: fotografia diária automática do volume (dashboard → app → Volumes → Snapshots).
- PocketBase: backup diário configurado no item 3 (painel → Settings → Backups, com botão de download).
