# Bluvium 開発引き継ぎ（現行版）

最終更新: 2026-03-24

この資料は、現行コードを前提に新規開発者が最短でキャッチアップするための運用メモです。

## 1. プロジェクト概要

- 名称: Bluvium
- 目的: 会員/所属/資格/大会/エントリー/決済を一気通貫で扱う
- フロント・バック: Next.js App Router 構成

## 2. 技術スタック

- Next.js 16
- TypeScript
- Prisma + PostgreSQL
- Stripe
- Vitest
- Capacitor（iOS / Android）

## 3. まず読む資料

- `README.md`
- `docs/API_SPEC.md`
- `docs/PERMISSIONS_CURRENT.md`
- `docs/OPERATIONS_MANUAL.md`
- `docs/TROUBLESHOOTING.md`

## 4. 権限モデル（現行）

### グローバルロール

- `USER`
- `ORG_ADMIN`
- `PF_ADMIN`

### スコープロール

- クラブ: `Membership.role`（`ADMIN` / `MEMBER`）
- 主催団体: `OrgAdmin.role`（`ADMIN` / `MEMBER`）
- 協会: `AssociationAdmin.role`（`ADMIN` / `MEMBER`）

### 一次情報

- `src/lib/accessControl.ts`
- `docs/PERMISSIONS_CURRENT.md`

## 5. 重要実装ポイント

### 認証

- ログイン/登録（SMS・パスワード・パスキー）
- セッションは Cookie ベース

### 決済

- Checkout セッション作成
- `POST /api/webhooks/stripe` で署名検証・冪等処理
- イベントは `StripeEvent` で重複耐性を持つ
- 主催団体の本番確認: `docs/STRIPE_ORGANIZER_PRODUCTION_CHECKLIST.md`

### 監査

- 重要操作は監査ログ基盤（`src/lib/auditLog.ts`）経由で記録

## 6. ローカル開発

```bash
pnpm install
cp .env.example .env.local
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

## 7. よく使うコマンド

- `pnpm dev`
- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm test:e2e`

## 8. テスト方針（現状）

- Unit: `vitest`（ドメインロジック中心）
- E2E: `tests/e2e` にスモークテスト導入済み
- E2E 実行時は `E2E_BASE_URL` が必要

## 9. 既知の課題

- 主催団体のエントリー代は **Stripe Connect Express（destination + application_fee）** で送金済み。本番チェックリストは `docs/STRIPE_ORGANIZER_PRODUCTION_CHECKLIST.md`
- 返金業務フローの運用最終化が必要
- E2E シナリオは拡張途中

## 10. 開発運用ルール

- API/権限仕様を変更したら、同時に `docs/API_SPEC.md` と `docs/PERMISSIONS_CURRENT.md` を更新
- 機密ファイルはコミットしない（Firebase/AWS/Stripe 実キー等）
- 大きな仕様変更時は、先にドキュメント更新方針を決めてから実装する

## 11. トラブル時の起点

- Webhook 問題: `docs/TROUBLESHOOTING.md` の Webhook 章
- ログイン/認証問題: `src/lib/auth.ts` と `src/app/api/auth/**`
- 権限問題: `src/lib/accessControl.ts`
