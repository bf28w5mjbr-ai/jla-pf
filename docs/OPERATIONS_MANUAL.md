# 運用マニュアル（Runbook）

最終更新: 2026-03-24

このドキュメントは、日次運用・リリース判定・障害一次対応を行うための実務手順です。

## 1. 参照先（一次情報）

- API 一覧: `docs/API_SPEC.md`
- 権限仕様: `docs/PERMISSIONS_CURRENT.md`
- 入口・ルーティング: `docs/SITE_ENTRY_AND_ROUTING.md`
- 障害対応詳細: `docs/TROUBLESHOOTING.md`
- ログ方針: `docs/LOGGING_POLICY.md`
- 当日運用: `docs/DAY_OPS_MANUAL.md`

## 2. 日次運用チェック

### 開始時（毎日）

- [ ] GitHub Actions の失敗ジョブ有無を確認（CI / security-scan / performance）
- [ ] 直近デプロイの healthcheck 成功を確認
- [ ] 決済/大会運用の問い合わせチケット有無を確認

### 終了時（毎日）

- [ ] 当日発生インシデントを `docs/TROUBLESHOOTING.md` に追記（再発防止メモ含む）
- [ ] 暫定運用をした場合、恒久対応の Issue を作成

## 3. ローカル運用手順

```bash
pnpm install
cp .env.example .env.local
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

補足:

- `.next/dev/lock` エラー時は既存の `next dev` プロセスを停止して再起動する
- 実機通知検証に必要な `google-services.json` / `GoogleService-Info.plist` は機密としてリポジトリ外管理

## 4. リリース前チェック

- [ ] `pnpm lint` が成功
- [ ] `pnpm build` が成功
- [ ] `pnpm test` が成功
- [ ] `pnpm test:e2e`（`E2E_BASE_URL` 指定）が成功
- [ ] 大会MVP判定項目を確認（`docs/COMPETITION_MVP_RELEASE_CHECKLIST.md`）

## 5. デプロイ運用

- ワークフロー: `deploy-canary.yml`
- 環境: `staging` / `canary` / `production`（GitHub Environments）

Environment Variables:

- `MIGRATE_COMMAND`（必須）
- `DEPLOY_COMMAND`（必須）
- `HEALTHCHECK_URL`（必須）
- `ROLLBACK_COMMAND`（必須）
- `DEPLOY_TOKEN`（必要時）

デプロイ時の動作:

1. `MIGRATE_COMMAND` 実行
2. `DEPLOY_COMMAND` 実行
3. `HEALTHCHECK_URL` を `curl` で確認
4. 失敗時は `ROLLBACK_COMMAND` 実行

## 6. 決済運用（Stripe）

- Webhook endpoint: `POST /api/webhooks/stripe`
- 要件: `STRIPE_WEBHOOK_SECRET` 設定必須
- 冪等処理: `StripeEvent` テーブルで管理

ローカル検証:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

確認ポイント:

- [ ] `checkout.session.completed` 受信で `Payment` 状態が更新される
- [ ] 対象 `EntryCheckoutSession` が `COMPLETED` になる
- [ ] 重複イベントで二重反映が起きない

## 7. 大会運用（要約）

1. 大会を `PUBLISHED` へ遷移
2. 個人/チームエントリー受付
3. 決済反映を Webhook で確認
4. 当日運用でヒートをリザルト確定 → 公開スタートリストに暫定順位表示
5. 必要時に結果管理の `lockedAt` でラウンド確定・編集ロック

## 8. 障害一次対応（テンプレ）

### A. API 全体障害

- [ ] `GET /api/health/live` の応答確認（プロセス生存）
- [ ] `GET /api/health/ready` の応答確認（依存関係 ready）
- [ ] 直近デプロイ有無を確認
- [ ] ロールバック判断（影響範囲、復旧見込み、代替導線）

### B. 決済反映遅延/失敗

- [ ] `STRIPE_WEBHOOK_SECRET` の設定確認
- [ ] Stripe 側イベント到達確認
- [ ] `StripeEvent` / `Payment` / `EntryCheckoutSession` の状態確認

### C. 権限エラー

- [ ] `docs/PERMISSIONS_CURRENT.md` の期待権限を確認
- [ ] 対象ユーザーのロールとスコープ紐付けを確認
- [ ] `src/lib/accessControl.ts` のガードに照らして再現確認

## 9. 変更管理ルール

- API 仕様変更時:
  - `docs/API_SPEC.md` を同時更新
- 権限仕様変更時:
  - `docs/PERMISSIONS_CURRENT.md` と `docs/PERMISSIONS.md` を同時更新
- 入口・リダイレクト・公開シェル変更時:
  - `docs/SITE_ENTRY_AND_ROUTING.md` を同時更新（公開データ範囲に影響する場合は `PERMISSIONS_CURRENT.md` §6 も）
- 障害再発防止:
  - 再現条件と恒久対策を `docs/TROUBLESHOOTING.md` に追記
# 運用マニュアル（簡易）

## 目的
本ドキュメントは運用担当向けに、起動・リリース・基本確認手順をまとめたものです。

## 環境変数
必須の環境変数は `docs/HANDOVER.md` の「環境変数」セクションを参照してください。

## ローカル起動
```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

## ビルド確認
```bash
pnpm lint
pnpm build
```

## デプロイ
- `deploy-canary.yml` が利用されます。
- `staging/canary/production` は GitHub Environments で管理。
- 各 Environment に以下の Variables を設定してください（必須）:
  - `MIGRATE_COMMAND`: DB マイグレーション実行コマンド
  - `DEPLOY_COMMAND`: デプロイ実行コマンド
  - `HEALTHCHECK_URL`: デプロイ後の疎通確認URL
  - `ROLLBACK_COMMAND`: ロールバックコマンド
- 必要に応じて Secret `DEPLOY_TOKEN` を設定してください。
- ワークフローは `MIGRATE_COMMAND` -> `DEPLOY_COMMAND` -> `HEALTHCHECK_URL` 検証の順に実行し、失敗時は `ROLLBACK_COMMAND` を実行します。

## 表示速度（TTFB）計測

本番の HTML 応答時間（TTFB）を curl で計測する:

```bash
pnpm measure:ttfb -- -n 5 --warmup 1 /
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  pnpm measure:ttfb -- -n 5 --warmup 1 / /dashboard
```

ベースライン記録: [`docs/PERFORMANCE_BASELINE.md`](./PERFORMANCE_BASELINE.md)

## 監視・セキュリティ
- CI/CodeQL は PR 必須。
- `security-scan.yml` が日次スケジュールで実行。
- `performance.yml` で Lighthouse / bundle size を計測。

## ログ運用
- アプリケーションログの基準は `docs/LOGGING_POLICY.md` を参照。
- 本番不要のデバッグ出力は削除し、機微情報はログに残さない。
- 当日運用の手順は `docs/DAY_OPS_MANUAL.md` を参照。

## 重要事項
- Stripe Webhook（`/api/webhooks/stripe`）は実装済み。`checkout.session.completed` を受けて、エントリー決済と請求ステータスを反映する。
- 公式結果は当日運用・主催の結果管理から登録。観客向けは公開スタートリスト（ヒート確定）が正。
- 収益分配（Connect等）は未実装。必要な場合は別途設計が必要。

## 大会MVPの運用フロー（決済/結果）
1. 主催者が大会を `PUBLISHED` にする（公開条件を満たす必要あり）。
2. 参加者が個人エントリー、クラブ管理者がチームエントリーを登録する。
3. 個人有料エントリーは Checkout で支払い、Webhook で入金反映される。
4. チーム請求は主催者が締切後に確定し、クラブ管理者が `team-entry` 画面から支払う。
5. 当日運用でヒート確定すると公開スタートリストに暫定結果が表示される。必要に応じ主催が結果管理で `lockedAt` を設定して確定する。

## 当日運用（不足埋めフェーズ）
- 主催管理画面に「当日運用」タブを追加済み。
- 大会単位レコーダー権限を割り当て可能。
- NFCチェックインと手入力救済をAPI/UIで実装済み。
- 召集/DNS/棄権/DSQの状態管理を実装済み。
- 暫定結果はリアルタイム配信し、主催管理者が公式結果へ確定できる。

## Stripe Webhook確認（ローカル）
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
- `.env.local` に `STRIPE_WEBHOOK_SECRET` が必要。
- Webhook受信時は `StripeEvent` と `Payment` / `EntryCheckoutSession` が更新される。
