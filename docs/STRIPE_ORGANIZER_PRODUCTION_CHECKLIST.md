# 本番: 主催団体 × Stripe チェックリスト

主催団体の **年額利用料（Checkout サブスクリプション）** と **エントリー代受取（Stripe Connect Express）**、および **参加者の有料エントリー** が本番で通るための確認項目です。

## 0. 運営・あなたの作業（手取り足取り）

コード側は `stripeRedirectOrigin()`（`src/lib/appBaseUrl.ts`）で Stripe の戻り先オリジンを **`NEXT_PUBLIC_APP_URL` 等に統一**済みです。以下は **リポジトリ外であなたが順にやること** です。

### A. アプリの URL（最初に必ず）

1. 本番でユーザーが開く URL を決める（例: `https://app.example.org`）。**`www` ありなしも含め表記ゆれを決める**。
2. ホスティング（Vercel 等）の **Environment Variables** に次を設定する。  
   - `NEXT_PUBLIC_APP_URL` = 上記と**完全一致**（末尾 `/` は付けない推奨）  
   - 既に `NEXT_PUBLIC_APP_ORIGIN` だけの場合は、**どちらか一方でも可**（`NEXT_PUBLIC_APP_URL` が優先される）。
3. **デプロイを再実行**して、ブラウザで本番 URL を開き、アドレスバーと `NEXT_PUBLIC_APP_URL` が一致していることを確認する。

### B. Stripe（本番モードで操作）

4. [Stripe Dashboard](https://dashboard.stripe.com) の右上で **本番モード**に切り替える。
5. **Connect** → 設定で Connect を有効にする（日本・Express で主催がオンボードする想定）。
6. **Developers → API keys** で **Secret key（`sk_live_...`）** をコピーする。
7. ホスティングの環境変数に **`STRIPE_SECRET_KEY`** を貼る（本番用）。**テストキーと混ぜない**。
8. **Developers → Webhooks** → **Add endpoint**  
   - URL: `https://<本番ドメイン>/api/webhooks/stripe`  
   - イベント: 下記「2. Stripe ダッシュボード」の表に列挙したものを選ぶ（「Send all events」でも可だがノイズが増える）。
9. エンドポイント作成後、**Signing secret（`whsec_...`）** をコピーし、ホスティングに **`STRIPE_WEBHOOK_SECRET`** として設定する。
10. 必要なら **`STRIPE_ORGANIZER_YEARLY_AMOUNT`**（年額・円）・**`STRIPE_PLATFORM_FEE_BPS`**（PF 手数料）を本番値に合わせる。  
11. 本番では **`STRIPE_CONNECT_SKIP_REQUIREMENT` は未設定または `false`** にする（`true` だと Connect なしで有料エントリーが通ってしまう）。

### C. デプロイ後の実機確認（主催目線）

12. テスト用の主催団体アカウントでログインする。
13. 団体を作成し、**年額プランに登録**して Stripe で支払い完了 → 団体が **有効（APPROVED）** になるまで待つ（戻り先が A で設定した URL であること）。
14. 団体ページの **「エントリー代の受け取り口座」** → **口座・本人確認** を Stripe の画面で最後まで完了する。戻ったあと **決済を受け付け可能** と出るか確認（出なければページ再読込）。
15. 有料の個人エントリー・チーム請求の決済を 1 件ずつ試し、Stripe の決済詳細で **Connect 送金 + application fee** になっているか確認する。

### D. うまくいかないとき

16. アプリのログと Stripe の **Developers → Webhooks → 該当エンドポイント → ログ**で、**400/500 とイベント未着**を見る。  
17. `docs/TROUBLESHOOTING.md` の「Webhook が動作しない」を読む。ローカルでは `stripe listen --forward-to localhost:3000/api/webhooks/stripe` で署名付き転送する。

---

## 1. 環境変数（ホスティング）

| 変数 | 役割 |
|------|------|
| `STRIPE_SECRET_KEY` | サーバーから Stripe API。本番は **sk_live_**、ダッシュボードも本番モードで確認すること。 |
| `STRIPE_WEBHOOK_SECRET` | `POST /api/webhooks/stripe` の署名検証。**未設定だと Webhook は 500**（`docs/TROUBLESHOOTING.md`）。 |
| `NEXT_PUBLIC_APP_URL` または `NEXT_PUBLIC_APP_ORIGIN` | **Stripe の戻り先オリジン**（`stripeRedirectOrigin()`）。年額 Checkout・個人/チームエントリー Checkout・Connect の refresh/return と**同じ**になる。 |
| `STRIPE_ORGANIZER_YEARLY_AMOUNT` | 主催年額（円）。未設定時はデフォルト値（コード参照）。 |
| `STRIPE_PLATFORM_FEE_BPS` | 有料エントリー時の PF 手数料（basis points）。 |
| `STRIPE_CONNECT_SKIP_REQUIREMENT` | **`true` のときだけ** Connect 未設定でも有料エントリーを許可（**本番では通常未設定または `false`**）。ローカル検証用。 |

### URL の整合（重要）

アプリは **`stripeRedirectOrigin()`**（内部で `getPublicAppUrl()`）に揃えており、**リクエストの Host には依存しない**。本番では **`NEXT_PUBLIC_APP_URL` をユーザーが実際に開くドメインに必ず合わせる**こと。

## 2. Stripe ダッシュボード（本番モード）

- [ ] **Connect** が有効で、日本向け Express のオンボードが問題なく作成できる。
- [ ] Webhook エンドポイントが **本番 URL** の `https://<本番ドメイン>/api/webhooks/stripe` を指している。
- [ ] 購読イベントに、少なくとも次が含まれる（実装: `src/app/api/webhooks/stripe/route.ts`）。

| イベント | 用途の目安 |
|----------|------------|
| `checkout.session.completed` | Checkout 完了・エントリー／支払い更新 |
| `checkout.session.async_payment_succeeded` | 非同期決済成功 |
| `checkout.session.expired` | セッション期限 |
| `checkout.session.async_payment_failed` | 非同期決済失敗 |
| `payment_intent.succeeded` / `payment_intent.payment_failed` | PaymentIntent 連動 |
| `charge.refunded` | 返金 |
| `charge.dispute.*` | チャージバック |
| **`account.updated`** | **Connect の `charges_enabled` を DB に反映** |
| `customer.subscription.updated` / `customer.subscription.deleted` | 主催の年額サブスク状態 |

## 3. 本番での動作確認（手順）

1. **主催団体を新規作成**（管理者としてログイン済み）。
2. **年額プランに登録** → Stripe Checkout で支払い完了 → 団体ページで **有効化（APPROVED）** になること。
3. 団体ページの **「エントリー代の受け取り口座（Stripe Connect）」** で **口座・本人確認** を完了し、**決済を受け付け可能**と表示されること（戻り後に表示が変わらない場合はページ再読込）。
4. **有料エントリー**が可能な大会で、参加者としてエントリー → Checkout が開き、決済完了後にエントリーが成立すること。
5. Stripe ダッシュボードで、該当決済が **Connect 先への transfer + application fee** になっていることを確認（`STRIPE_CONNECT_SKIP_REQUIREMENT` がオフのとき）。

## 4. トラブル時

- Webhook 全般: `docs/TROUBLESHOOTING.md` の「Webhook が動作しない」。
- Stripe API キー・Connect 無効: 主催の「口座・本人確認」API が 400/503 を返す場合、レスポンスの `error` メッセージとサーバーログを参照。

## 5. 関連コード（参照用）

- 正規オリジン: `src/lib/appBaseUrl.ts`（`stripeRedirectOrigin`）
- 年額 Checkout: `src/app/api/organizations/[orgId]/onboarding/checkout/route.ts`
- Connect Account Link: `src/app/api/organizations/[orgId]/stripe-connect/account-link/route.ts`
- 有料エントリーのブロック理由: `src/lib/organizerBilling.ts`（`paidEntryCheckoutBlockReason`）
- Webhook: `src/app/api/webhooks/stripe/route.ts`
