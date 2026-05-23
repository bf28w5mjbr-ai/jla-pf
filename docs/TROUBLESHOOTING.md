# トラブルシューティング

## Supabase に接続できない（`Can't reach database server`・pooler 6543）

- プロジェクトが **Paused** になっていないか Supabase ダッシュボードで確認する。
- **Transaction pooler**（`*.pooler.supabase.com:6543`）にローカルから届かない場合がある。ダッシュボードの **Connect** → **Database** で **Direct connection**（`db.*.supabase.co:5432`）の URI を `.env` の **`DATABASE_URL_UNPOOLED`** に入れる。`pnpm formalize:organization` など CLI は `datasourceUrlForScripts`（`src/server/db.ts`）で **`DATABASE_URL_UNPOOLED` を優先**し、ホストが `*.supabase.co` のとき **未指定なら `sslmode=require` を自動付与**する。
- **Direct でも `Can't reach`** のときは、ローカルから **5432 番がブロック**されていることが多い（テザリングや別回線、VPN オフを試す）。CLI が不要なら **Supabase → SQL Editor** で更新する（`pnpm formalize:organization` 失敗時に案内 SQLが標準エラーへ出る）。
- IPv6 まわりの問題のときは別回線・VPN オフを試す。

## Prisma migrate dev の警告
**例**: `ClubStatus` / `OrgStatus` の enum から `ACTIVE` が削除される警告
- 対応: DB 内に `ACTIVE` が残っていないことを確認してから migration を実行。

## Webhook が動作しない
- `STRIPE_WEBHOOK_SECRET` が未設定だと 500 になる。
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` で署名付きイベントを転送する。
- `checkout.session.completed` が来ない場合、`Payment` と `EntryCheckoutSession` は更新されない。
- Webhookイベント重複時は `StripeEvent` で冪等処理されるため、まず `stripe_events` の状態を確認する。
- 主催団体の Connect 状態は `account.updated` でも更新する。購読漏れは `docs/STRIPE_ORGANIZER_PRODUCTION_CHECKLIST.md` を参照。

## チーム請求の決済ボタンが押せない
- **エントリー期間中**: チームエントリーを保存して `Payment` ができているか、請求額が 0 円より大きいか確認（期間中は主催の確定なしで決済可）。
- **エントリー締切後**: 主催側で `チーム請求確定`（`/api/competitions/{id}/team-billing/finalize`）が実行済みか確認。
- 請求ステータスが `SUCCEEDED` の場合、クラブ側では再決済ボタンを表示しない。
- 請求額が 0 円、またはクラブ管理者権限がない場合は決済開始不可。

## 公式結果が公開されない
- 公式結果登録時に `publishedAt` を設定しているか確認。
- 他大会/他種目のエントリーIDを混在させると 400 で保存失敗する。
- `lockedAt` が設定済みの結果は更新できない（409）。

## 当日運用でレコーダー画面が開けない
- 大会単位レコーダー割当が有効か確認（主催側 `day-ops/recorders`）。
- 主催管理者または割当済みレコーダー以外はアクセス不可。
- 公開/非公開に関係なく、権限なしユーザーはリアルタイム配信に接続できない。

## NFC召集が失敗する
- 対象ユーザーに `nfcTagId` が設定されているか確認。
- 対象ユーザーが当該大会に出場登録済み（個人またはチームメンバー）か確認。
- APIは `POST /api/competitions/{id}/day-ops/participant-statuses/nfc-call` を使用する。

## 暫定結果がリアルタイムに表示されない
- `/api/competitions/{id}/day-ops/realtime/stream` が接続できているか確認。
- レコーダー画面で `暫定保存` できているか確認。
- ブラウザ/ネットワーク制限で `EventSource` がブロックされていないか確認。
- リアルタイム暫定結果はスタッフ認可が必要。一般ユーザーには表示されない。

## 暫定結果の保存が 409 で失敗する
- 対象種目・ラウンドの公式結果が `lockedAt` 済みだと、暫定結果更新は拒否される。
- 運用上再編集が必要な場合は、主催責任者の承認後に再確定フローで対応する。

## participant-statuses が 403 になる
- `participant-statuses` / `nfc-call` / `auto-dns` は主催管理者（`OrgAdmin.role=ADMIN`）専用。
- レコーダー権限では実行できない。主催管理画面の当日運用タブから操作する。

## ビルドが失敗する
- `pnpm typecheck` / `pnpm lint` のエラーを先に解消。
- `pnpm prisma generate` が未実行の場合は先に実行。

## healthcheck が失敗する
- `GET /api/health/live` が 200 ならプロセスは起動中。
- `GET /api/health/ready` が 503 の場合、レスポンスの `required` / `integrations` を見て不足設定を特定する。
- `GET /api/health?deep=1` は Stripe API も確認するため、Stripe 障害時は `deep.stripeApi=failed` になる。

## エラー追跡時のポイント
- API 500 応答の `x-request-id` を控え、同じ ID をサーバーログで検索する。
- 監査ログに `request.requestId` が残るため、操作追跡時は同一IDをキーに照合する。

## 新規登録のメール認証で `internal_error` や 500 になる
- ブラウザの Network で失敗した `POST /api/registration/verify` または `POST /api/registration/start` の **`x-request-id`** を控える（Vercel の Request ID と同一のことが多い）。
- Vercel Runtime Logs で `POST api/registration/verify/route.ts` を検索し、同じ ID で **`[request_id=...]`** 付きの `console.error` 行（`Error.name` + `message`）を開く。スタックが足りないときは一時的に `LOG_FULL_ERROR_STACK=true`。
- 所要時間が **3秒前後** で OTP 不一致（400）ではない場合、OTP 成功後の **`prisma.user.create`** または **`onAuthLoginSuccess`（`UserLoginEvent` / `AuthLoginChannel.REGISTRATION`）** で落ちている可能性が高い。後者は修正後は登録自体は成功し、ログイン履歴のみ失敗する。
- `GET /api/health/ready` で `required.authSecret`・DB 接続・`registrationEmailOtp` / `resendApiKeyConfigured` を確認する。
- ログに `Unique constraint` / `P2002` がある場合はメールまたは氏名+生年月日の重複。画面には日本語の 409 が出る想定（古いクライアントのみ `internal_error` 表示の可能性あり）。
- ログに `AUTH_SECRET must be set` がある場合は本番の `AUTH_SECRET`（32文字以上）を設定する。
- Runtime Logs の `[registration/verify]` で `phase` を確認する（`otp_ok` → `user_created` → `cookie_set` の順）。`user_created` 後に落ちる場合は Cookie / `AUTH_SECRET` を疑う。

## 新規登録メール認証の再発防止

- **デプロイ前**: `GET /api/health/ready` で `required.authSecret`・`registrationEmailOtp`・`resendApiKeyConfigured`・`warnings` が空であることを確認する。
- **CI**: `node scripts/check-registration-otp-invariants.mjs` が登録 verify ルートの必須パターン（`verifyRegistrationOtp`・`$transaction` 等）を検査する。
- **テスト**: `pnpm test:registration` で OTP 検証経路と P2002→409 変換を実行する。
- **本番監視**: Vercel Logs で `POST api/registration/verify/route.ts` の 500 件数をウォッチし、`[registration/verify] phase=user_created` の直後のエラーをアラート対象にする。
- **環境変数**: メール OTP 運用時は `SKIP_SMS=true`・`REGISTRATION_EMAIL_OTP=true`・`RESEND_API_KEY`・`AUTH_SECRET`（32文字以上）をセットで設定する。

## ローカルでログインできない
- `AUTH_SECRET` を含む必須環境変数を設定。
- Cookie セッションが削除されていないか確認。

## 画像アップロードが失敗する
- 画像アップロード用のAPIが存在するか (`/api/upload/*`) を確認。
- ストレージの設定（S3 など）が未設定の場合は失敗する可能性があります。
