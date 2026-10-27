# CTX 2.0 — imagem única: PocketBase (banco + API + rotinas) servindo também o frontend.
# Etapa 1: compila o frontend (React + Vite)
FROM node:22-alpine AS web
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

# Etapa 2: PocketBase
FROM alpine:3.20
ARG PB_VERSION=0.40.6
RUN apk add --no-cache ca-certificates unzip
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip
COPY backend/pb_hooks /pb/pb_hooks
COPY backend/pb_migrations /pb/pb_migrations
COPY --from=web /app/dist /pb/pb_public
COPY deploy/start.sh /pb/start.sh
WORKDIR /pb
EXPOSE 8080
CMD ["/bin/sh", "/pb/start.sh"]
