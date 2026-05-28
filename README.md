# Bluvium

Bluvium は、会員・所属・資格・大会エントリー・決済を一気通貫で扱う Next.js アプリケーションです。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Stripe
- Vitest
- Capacitor（iOS / Android）

## セットアップ

1. 依存関係をインストール

```bash
pnpm install
```

2. 環境変数を作成

```bash
cp .env.example .env.local
```

3. Prisma クライアント生成とマイグレーション適用

```bash
pnpm prisma generate
pnpm prisma migrate dev
```

4. 開発サーバー起動

```bash
pnpm dev
```

## 開発時の注意

- `pnpm dev` で `.next/dev/lock` エラーが出る場合、別の Next.js プロセスが起動中です。既存プロセスを停止してから再実行してください。
- Stripe Webhook は `POST /api/webhooks/stripe` で受信・処理します。ローカル確認時は `stripe listen --forward-to localhost:3000/api/webhooks/stripe` を使います。
- 未決済の出場意思確認メール（一括送信・期限後 DNS）を本番同等に試す場合は `.env.local` に `RESEND_API_KEY` と `CRON_SECRET` を設定してください。期限後 DNS は Vercel Cron が自動実行します（ローカルでは `docs/API_SPEC.md` の curl 例または `process-deadline` API）。

## 主要スクリプト

- `pnpm dev`: 開発サーバー起動
- `pnpm build`: 本番ビルド
- `pnpm lint`: ESLint
- `pnpm test`: Vitest（ユニットテスト）
- `pnpm test:e2e`: E2Eスモークテスト（`E2E_BASE_URL` 必須）

## ドキュメント

- `docs/API_SPEC.md`: APIエンドポイント一覧
- `docs/PERMISSIONS_CURRENT.md`: 権限仕様の一次情報
- `docs/OPERATIONS_MANUAL.md`: 運用手順
- `docs/TROUBLESHOOTING.md`: 障害対応
- `docs/APP_MOBILIZATION_ROADMAP.md`: アプリ化 8 フェーズ（配布形態〜実機検証の順）
- `docs/APP_MOBILIZATION_WALKTHROUGH.md`: アプリ化の手取り手順（コマンドと実機チェック順）
- `docs/MOBILIZATION_STORE_AND_CI.md`: ストア審査・Universal Links・CI/署名・掲載/法務
- `docs/MOBILE_DEVICE_TEST_CHECKLIST.md`: モバイル実機検証（プッシュ中心）

## ライセンス

社内/関係者向けプロジェクトとして運用しています。
