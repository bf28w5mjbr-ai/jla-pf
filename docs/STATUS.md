# Bluvium 実装状況（現行）

最終更新: 2026-03-24

このドキュメントは、現行コードベースに合わせた実装状況の要約です。  
一次情報は `src/app/api/**/route.ts`、`src/lib/**`、`prisma/schema.prisma` を参照してください。

## 現在地

- コア機能（認証、所属、資格、大会、エントリー、管理UI）は実装済み
- Stripe Webhook（`/api/webhooks/stripe`）は実装済み
- モバイル（Capacitor iOS/Android）の土台は導入済み
- 主要ドキュメント群（API/運用/トラブルシュート）は整備済み

## 実装済み（要点）

### ドメイン・基盤

- Prisma スキーマとマイグレーション管理
- 監査ログ基盤（`src/lib/auditLog.ts`）
- RBAC/スコープガード（`src/lib/accessControl.ts`）

### 決済

- Stripe Checkout セッション作成
- Webhook 受信、署名検証、冪等処理（`StripeEvent`）
- `checkout.session.completed` / `payment_intent.*` / `charge.refunded` などの状態同期

### 大会運用

- 大会公開/更新
- 個人・チームエントリー
- 結果関連 API / 画面
- 当日運用系 API（day-ops 系）

### 管理・運用

- 協会/クラブ申請承認系 API
- 通知系 API（管理者テスト送信含む）
- 画像アップロード API（プロフィール/クラブロゴ）

## 進行中・未完了

- Stripe Connect による収益分配の本実装
- 返金時の業務フロー（運用ルール含む）最終化
- E2E テストの主要フロー拡張（現状はスモークの導入段階）
- ドキュメントの継続的同期（新規 API 追加時）

## テスト状況

- Unit: Vitest ベースで一部実装済み
- E2E: `tests/e2e/health.e2e.test.ts` を導入済み
- 実行コマンド:
  - `pnpm test`
  - `pnpm test:e2e`（`E2E_BASE_URL` を指定）

## 運用上の注意

- `pnpm dev` の `.next/dev/lock` エラーは多重起動時に発生するため、既存 dev プロセスを停止してから再起動する
- 機密ファイル（`google-services.json` / `GoogleService-Info.plist`）はリポジトリ外管理
- 権限仕様は `docs/PERMISSIONS_CURRENT.md` を正とし、旧資料は参考扱い

## 次アクション（優先）

1. Stripe Connect と収益分配仕様を確定し実装
2. 認証/エントリー/決済/管理の E2E シナリオ拡張
3. API 追加ごとに `docs/API_SPEC.md` を同期更新
