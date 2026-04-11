# Use official Node.js runtime as base image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# next build は NODE_ENV=production 相当で auth モジュールが読み込まれ、AUTH_SECRET（32文字以上）が必須。
# イメージ内のデフォルトはビルド通過用のダミー。本番は docker run / compose で AUTH_SECRET を必ず上書きすること。
ARG AUTH_SECRET=ci-build-placeholder-secret-min-32-chars-xx
ENV AUTH_SECRET=$AUTH_SECRET

# Build application
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
