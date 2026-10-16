# Use official Node.js runtime as base image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files. schema は postinstall の prisma generate が参照する
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# package.json の pnpm を有効にし、依存を入れる（postinstall で generate）
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# next build は AUTH_SECRET と prerender 用 DB を要求する。
# イメージ内に DB は無い。ビルド中だけ公開 ISR を空データにし、秘密情報は入れない。
# 実行時は docker run / compose で AUTH_SECRET と DATABASE_URL を上書きすること。
ARG AUTH_SECRET=ci-build-placeholder-secret-min-32-chars-xx
ENV AUTH_SECRET=$AUTH_SECRET \
    DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/bluvium_ci \
    DATABASE_URL_UNPOOLED=postgresql://ci:ci@127.0.0.1:5432/bluvium_ci \
    DOCKER_IMAGE_BUILD=1

RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "start"]
