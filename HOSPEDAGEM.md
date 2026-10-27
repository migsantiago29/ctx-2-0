# CTX 2.0 — Hospedagem própria (Railway)

Tudo roda num único serviço no Railway: o PocketBase guarda os dados, responde à API, executa a rotina diária e entrega as telas do app.
Cada alteração enviada ao GitHub (branch `main`) gera uma nova versão publicada automaticamente.

## Custo
Plano Hobby do Railway: US$ 5/mês (inclui US$ 5 de uso, suficiente para o CTX 2.0).

## Variáveis de ambiente (Railway → serviço → Variables)
| Nome | Valor |
|---|---|
| `PB_ADMIN_EMAIL` | e-mail do superusuário do painel `/_/` |
| `PB_ADMIN_PASSWORD` | senha forte do superusuário (guardar num gerenciador de senhas) |

## Volume
Railway → serviço → Volume montado em `/pb/pb_data`. Sem o volume, os dados se perdem a cada nova versão.

## Primeiro acesso depois da publicação
1. Abrir `https://<endereço>/_/` e entrar com o superusuário.
2. Settings → Application: nome "CTX 2.0" e URL pública do app.
3. Settings → Backups: backup automático diário, mantendo os 7 mais recentes.
4. Abrir o app, entrar como `miguel.santiago@ctxcenografia.com.br` (senha antiga do Skip) e trocar a senha (obrigatório).
5. Administração → Importação: importar os 6 CSVs (Etapa 1: 01, 02, 04; Etapa 2: 03, 05, 06) e conferir o relatório.

## Teste da rotina diária
Painel `/_/` → Settings → Crons → `rotina_ciclos_automation` → Run. Ela só age se a rotina estiver ativada em Administração → Ciclos & Adesão.
