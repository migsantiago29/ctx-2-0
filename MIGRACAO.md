# Guia Completo de Migração — CTX 2.0 (Skip Cloud para PocketBase Self-Hosted)

<!-- Sincronização GitHub: commit inicial de exportação e artefatos de migração -->

Este documento descreve detalhadamente a arquitetura do backend, regras de segurança, rotinas automatizadas, migrações, variáveis de ambiente e o procedimento passo a passo para executar e hospedar a aplicação **CTX 2.0** em infraestrutura própria (PocketBase self-hosted + frontend estático).

---

## 1. Arquitetura e Coleções do Banco de Dados

O banco de dados PocketBase é composto por **15 coleções** (1 de autenticação padrão e 14 coleções base).

### 1.1 Coleções e Regras de Acesso

| Coleção                       | Tipo | Descrição                                                                                                                                                                                 | Regras de Acesso (List / View / Create / Update / Delete)                                                                                                                                                                                                                                      |
| ----------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **users** (`_pb_users_auth_`) | auth | Usuários do sistema (e-mail, senha, cargo, área, role, must_change_password)                                                                                                              | **List:** `@request.auth.id != ''`<br>**View:** `@request.auth.id != ''`<br>**Create:** `@request.auth.role = 'admin' \|\| @request.auth.id != ''`<br>**Update:** `@request.auth.id != '' && (id = @request.auth.id \|\| @request.auth.role = 'admin')`<br>**Delete:** `id = @request.auth.id` |
| **areas**                     | base | Áreas organizacionais (nome, descricao, ordem_no_fluxo, tipo)                                                                                                                             | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **colaboradores**             | base | Cadastro de colaboradores (codigo, nome, cargo, area, email, sem_metas, usuario)                                                                                                          | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **projetos_estrategicos**     | base | Projetos macro (codigo, nome, descricao, sponsor)                                                                                                                                         | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **processos**                 | base | Etapas da cadeia de valor (codigo, nome, area, observacao, etapas_anteriores, etapas_sucessoras)                                                                                          | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **metas**                     | base | Metas estratégicas (codigo, titulo, descricao, projeto, responsaveis, projeto_secundario, periodicidade, prazo, trimestre, processos_vinculados, valor_alvo_a_definir, progresso, status) | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **indicadores**               | base | Métricas vinculadas a metas (meta, nome, valor_atual, valor_meta, tendencia, historico, ordem, alvo)                                                                                      | **List / View / Create / Update / Delete:** `@request.auth.id != ''`                                                                                                                                                                                                                           |
| **fluxograma_posicoes**       | base | Coordenadas X/Y personalizadas dos blocos de processo no diagrama                                                                                                                         | **List / View:** `@request.auth.id != ''`<br>**Create / Update / Delete:** `@request.auth.id != '' && @request.auth.role = 'admin'`                                                                                                                                                            |
| **configuracoes**             | base | Parâmetros gerais da rotina de metas (chave, rotina_ativa, pulso_ativo, valor)                                                                                                            | **List / View:** `@request.auth.id != ''`<br>**Create / Update / Delete:** `@request.auth.id != '' && (@request.auth.role = 'admin' \|\| @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')`                                                                                        |
| **ciclos**                    | base | Períodos de apuração (tipo, referencia, titulo, abertura, fechamento, status)                                                                                                             | **List / View:** `@request.auth.id != ''`<br>**Create / Update / Delete:** `@request.auth.id != '' && (@request.auth.role = 'admin' \|\| @request.auth.email = 'miguel.santiago@ctxcenografia.com.br')`                                                                                        |
| **avaliacoes**                | base | Apurações mensais de metas (ciclo, meta, preenchido_por, farol, avancou, proximo_passo, ajuda_colaborador, ajuda_texto, ajuda_status, evidencia_link, evidencia_arquivo)                  | **List / View / Create / Update:** `@request.auth.id != ''`<br>**Delete:** `@request.auth.id != '' && @request.auth.role = 'admin'`                                                                                                                                                            |
| **pulsos**                    | base | Check-ins semanais das metas (ciclo, colaborador, meta, resposta, bloqueio_texto, feedback_texto)                                                                                         | **List / View / Create / Update:** `@request.auth.id != ''`<br>**Delete:** `@request.auth.id != '' && @request.auth.role = 'admin'`                                                                                                                                                            |
| **comentarios**               | base | Linha de diálogo em avaliações mensais (avaliacao, autor, texto)                                                                                                                          | **List / View / Create:** `@request.auth.id != ''`<br>**Update:** `@request.auth.id != '' && autor = @request.auth.id`<br>**Delete:** `@request.auth.id != '' && (@request.auth.role = 'admin' \|\| autor = @request.auth.id)`                                                                 |
| **notificacoes**              | base | Alertas do sistema (destinatario, tipo, texto, link, lida)                                                                                                                                | **List / View / Update / Delete:** `@request.auth.id != '' && destinatario = @request.auth.id`<br>**Create:** `@request.auth.id != ''`                                                                                                                                                         |

---

## 2. Server Hooks (`pb_hooks`) e Endpoints Personalizados

Os arquivos em `backend/pb_hooks` expõem rotas HTTP seguras com lógica transacional e validação de permissões:

### 2.1 `admin_users.js`

- **`POST /backend/v1/ctx/sync-user`**:
  - **Função**: Criação ou sincronização de usuários no auth do PocketBase com verificação automática (`verified=true`), flag `must_change_password`, e vinculação de cargo/área/role.
  - **Permissão**: Exclusivo para usuários autenticados com role `admin` ou superuser.
- **`POST /backend/v1/ctx/first-access-password`**:
  - **Função**: Permite ao colaborador autenticado no primeiro acesso definir sua senha definitiva (mínimo 8 caracteres, diferente da provisória `CTX@2027`) e remove a flag `must_change_password`.
  - **Permissão**: Qualquer usuário autenticado com sessão válida.
- **`POST /backend/v1/ctx/admin-reset-password`**:
  - **Função**: Permite que o administrador redefina manualmente a senha de qualquer colaborador, marcando novamente `must_change_password=true`.
  - **Permissão**: Exclusivo para administradores.

### 2.2 `fluxograma.js`

- **`POST /backend/v1/ctx/fluxograma/save-positions`**:
  - **Função**: Salva em lote (transacional) as coordenadas X/Y de todos os nós do fluxograma, evitando rate-limit de chamadas REST individuais.
  - **Permissão**: Administradores.
- **`POST /backend/v1/ctx/fluxograma/reset-positions`**:
  - **Função**: Limpa a tabela `fluxograma_posicoes`, retornando à disposição de layout automático (swimlanes por área).
  - **Permissão**: Administradores.

### 2.3 `rotina.js`

- **`POST /backend/v1/ctx/avaliacoes`**:
  - **Função**: Salva avaliação mensal, atualiza o status/farol da meta (`meta.status = farol`) e atualiza o progresso para 100% se for `concluida`. Dispara notificações no app (para colaboradores solicitados em pedido de ajuda, sponsor do projeto, admins, e notificação coletiva de meta concluída).
  - **Permissão**: Usuários autenticados (valida se o usuário é responsável pela meta ou admin).
- **`POST /backend/v1/ctx/pulsos`**:
  - **Função**: Registra em lote os check-ins do pulso semanal (`avancei`, `sem_avanco`, `travado`, bloqueio e feedback).
  - **Permissão**: Usuários autenticados.
- **`POST /backend/v1/ctx/comentarios`**:
  - **Função**: Adiciona comentário em uma avaliação e gera notificação para o responsável.
  - **Permissão**: Usuários autenticados.
- **`POST /backend/v1/ctx/admin-rotina`**:
  - **Função**: Operações administrativas da rotina (`toggle_rotina`, `toggle_pulso`, `criar_ciclo`, `fechar_ciclo`, `reabrir_ciclo`, `ajustar_datas`, `lembrar_pendentes`).
  - **Permissão**: Administradores.
- **`GET /backend/v1/ctx/export-csv`**:
  - **Função**: Exporta CSV formatado com BOM UTF-8 e delimitador `;` contendo avaliações ou pulsos com filtros opcionais.
  - **Permissão**: Administradores.

---

## 3. Job Agendado (Cron): `rotina_ciclos_automation`

Configurado no PocketBase através da função `cronAdd('rotina_ciclos_automation', '0 6 * * *', ...)` no arquivo `rotina.js`:

- **Horário de Execução**: Diariamente às **06:00 UTC** (03:00 horário de Brasília).
- **Pré-requisito**: Executa apenas se `configuracoes.rotina_ativa === true`.
- **Regras de Abertura e Fechamento**:
  1. **Pulso Semanal**:
     - Ativado quando `configuracoes.pulso_ativo === true`.
     - Verifica se o dia atual é segunda-feira (`diaSemana === 1`).
     - Se sim, calcula o código da semana (ex.: `2026-S15`) e cria o ciclo com abertura na segunda às 08:00 UTC e fechamento na sexta-feira às 21:00 UTC (18:00 Brasília).
  2. **Avaliação Mensal**:
     - Verifica se é dia 25 do mês (`diaMes === 25`).
     - Se sim, cria o ciclo mensal (ex.: `2026-03`) com abertura no dia 25 às 08:00 UTC e fechamento no dia 5 do mês subsequente às 23:59:59 UTC.
  3. **Fechamento Automático**:
     - Varre todos os ciclos com `status = 'aberto'`. Se `agora > fechamento`, atualiza o status para `'fechado'`.
- **Notificações e Faróis**:
  - Quando um ciclo é aberto, colaboradores com metas ativas recebem notificação do tipo `ciclo_aberto`.
  - Notificações de lembrete (`lembrete`) são disparadas quando o admin utiliza o recurso "Lembrar pendentes".
  - O preenchimento da avaliação mensal atualiza imediatamente o status da meta com o farol correspondente (`verde`, `atencao`, `vermelho`, `concluida`).

---

## 4. Variáveis de Ambiente e Segredos

### 4.1 Variáveis Existentes no Skip Cloud

Apenas os **NOMES** das variáveis configuradas no ambiente Skip:

- `PB_INSTANCE_URL`
- `PB_SUPERUSER_TOKEN`
- `SITE_URL`
- `SKIP_AI_CHAT_API_KEY` _(Exclusivo Skip — pode ser descartado)_
- `SKIP_AI_CHAT_URL` _(Exclusivo Skip — pode ser descartado)_
- `SKIP_AI_GATEWAY_API_KEY` _(Exclusivo Skip — pode ser descartado)_
- `SKIP_AI_GATEWAY_URL` _(Exclusivo Skip — pode ser descartado)_

### 4.2 Variáveis Necessárias no PocketBase Self-Hosted

Para hospedar o PocketBase por conta própria:

1. **Frontend (Vite)**:
   - `VITE_POCKETBASE_URL`: URL pública ou local da sua instância PocketBase (ex.: `http://127.0.0.1:8090` ou `https://pb.meudominio.com.br`). Se não for informada, o cliente em `src/lib/pocketbase/client.ts` utiliza `window.location.origin`.
2. **PocketBase Server (Configurações no Admin UI ou flags de CLI)**:
   - Porta/Host: `--http="0.0.0.0:8090"`
   - **SMTP (E-mails transacionais)**: Configurado diretamente no painel Admin do PocketBase (**Settings > Mail settings**), com servidor SMTP, porta, usuário, senha, remetente (TLS/SSL). Não requer variáveis de ambiente adicionais, pois o PocketBase armazena na sua base `pb_data`.
   - Se for usar reverse proxy (Nginx / Caddy / Traefik), configure o cabeçalho `X-Forwarded-For` e SSL automático.

---

## 5. Passo a Passo para Rodar Localmente

### 5.1 Pré-requisitos

- **Node.js**: Versão 20.x ou 22.x LTS recomendada.
- **NPM**: Gerenciador padrão incluído com Node.js (ou PNPM / Yarn).
- **Binário do PocketBase**: Baixar a versão mais recente (v0.22.x ou compatível) para o seu sistema operacional em [pocketbase.io](https://pocketbase.io/docs/).

### 5.2 Estrutura de Pastas para o PocketBase

Crie uma pasta para o seu servidor ou use a pasta `/backend`:

```bash
mkdir meu-pb-server
cd meu-pb-server

# Copie o binário do pocketbase para cá
# Copie as pastas pb_hooks e pb_migrations geradas na pasta /backend do repositório:
cp -r /caminho/do/projeto/backend/pb_hooks ./pb_hooks
cp -r /caminho/do/projeto/backend/pb_migrations ./pb_migrations
```

### 5.3 Inicializar e Executar o PocketBase

```bash
./pocketbase serve --http="127.0.0.1:8090"
```

Ao iniciar pela primeira vez:

1. O PocketBase executará automaticamente todas as migrações JS contidas em `pb_migrations/`.
2. Acesse a URL do painel administrativo: `http://127.0.0.1:8090/_/`
3. Crie a conta do primeiro superadministrador (e-mail e senha).
4. As 15 coleções estarão prontas. Caso queira reimportar o schema bruto manualmente, vá em **Settings > Collections > Import collections** e selecione o arquivo `backend/pb_schema.json`.

### 5.4 Executar o Frontend

No diretório raiz do projeto:

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variável de ambiente apontando para o PocketBase local
# Crie um arquivo .env na raiz:
echo "VITE_POCKETBASE_URL=http://127.0.0.1:8090" > .env

# 3. Rodar em modo de desenvolvimento
npm run dev

# Ou construir para produção:
npm run build
npm run preview
```

Acesse a aplicação no navegador em `http://localhost:5173`.

---

## 6. Como Importar os Dados

Existem duas formas seguras e completas de importar os dados no seu novo ambiente:

### Opção A: Via Telas de Importação CSV (Recomendado para início limpo)

1. Acesse o sistema como usuário administrador (`miguel.santiago@ctxcenografia.com.br`).
2. Vá ao menu lateral **Administração > Importação**.
3. Importe os arquivos CSV nas duas etapas previstas:
   - **Etapa 1**: Áreas, Colaboradores e Processos (o sistema automaticamente conecta logins e hierarquias).
   - **Etapa 2**: Metas, Projetos Estratégicos e Indicadores.
4. Vá ao **Editor de Diagrama** para organizar ou ajustar a disposição dos processos se desejar.

### Opção B: Via Tela de "Exportação Completa" (JSON + ZIP de Arquivos)

1. No ambiente de origem, o administrador acessa **Administração > Exportação completa**.
2. Clica em **"Gerar Backup Completo (.ZIP)"**.
3. O arquivo compactado conterá:
   - Todas as 15 coleções exportadas em `.json` e `.csv`.
   - A pasta `arquivos/` com todas as evidências em PDF/imagem e avatares.
4. Os dados em JSON podem ser restaurados utilizando scripts de inserção via PocketBase SDK ou API REST padrão do PocketBase.
