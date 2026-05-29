# API仕様書（エンドポイント一覧）

このドキュメントは `src/app/api/**/route.ts` の実装から抽出した**現行のエンドポイント一覧**です。詳細なリクエスト/レスポンス仕様は各 `route.ts` を参照してください。

> 注意: `method_not_allowed` を返すダミー実装も、HTTPメソッドとしては定義済み扱いで記載しています。

## ヘルスチェック
- `GET /api/health`（旧ドキュメントの `/api/_health` は App Router の `_` 規則でルートにならないため非推奨）

## 認証
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/login/sms/start`
- `POST /api/auth/login/sms/verify`

## 登録フロー
- `POST /api/registration/start`
- `POST /api/registration/verify`

## ユーザー
- `POST /api/user/security`
- `POST /api/user/verify-password`
- `PUT /api/user/update-profile`
- `POST /api/user/delete-account`
- `POST /api/user/phone-change/start`
- `POST /api/user/phone-change/verify`

## アップロード
- `POST /api/upload/profile-photo`
- `DELETE /api/upload/profile-photo`
- `POST /api/upload/club-logo`

## クラブ
- `GET /api/clubs`
- `POST /api/clubs`（廃止・410。`POST /api/clubs/create` を使用）
- `POST /api/clubs/create`（作成時 `APPROVED`・管理者メンバーシップ自動付与）
- `GET /api/clubs/search`（参加可能クラブは `APPROVED` のみ）
- `POST /api/clubs/apply`（非推奨。`POST /api/clubs/[clubId]/join` と同一）
- `POST /api/clubs/[clubId]/join`（参加申請 → `Membership` は `PENDING`、管理者承認で `APPROVED`）
- `POST /api/clubs/[id]/leave`
- `PUT /api/clubs/[id]/update`
- `DELETE /api/clubs/[id]/delete`

### クラブ：お知らせ
- `GET /api/clubs/[id]/announcements`
- `POST /api/clubs/[id]/announcements`
- `PUT /api/clubs/[id]/announcements/[announcementId]`
- `DELETE /api/clubs/[id]/announcements/[announcementId]`

### クラブ：活動記録
- `GET /api/clubs/[id]/activities`
- `POST /api/clubs/[id]/activities`
- `DELETE /api/clubs/[id]/activities/[activityId]`

### クラブ：メンバー管理（個別）
- `DELETE /api/clubs/[id]/members/[membershipId]`
- `POST /api/clubs/[id]/members/[membershipId]/approve`
- `POST /api/clubs/[id]/members/[membershipId]/reject`
- `PUT /api/clubs/[id]/members/[membershipId]/role`

### クラブ：会費
- `GET /api/clubs/[clubId]/dues-settings`
- `POST /api/clubs/[clubId]/dues-settings`
- `PUT /api/clubs/[clubId]/dues-settings`

- `GET /api/clubs/[clubId]/dues`
- `POST /api/clubs/[clubId]/dues`
- `PUT /api/clubs/[clubId]/dues`
- `PATCH /api/clubs/[clubId]/dues`
- `DELETE /api/clubs/[clubId]/dues`

- `GET /api/clubs/[clubId]/dues/[duesId]`
- `POST /api/clubs/[clubId]/dues/[duesId]`
- `PUT /api/clubs/[clubId]/dues/[duesId]`
- `PATCH /api/clubs/[clubId]/dues/[duesId]`
- `DELETE /api/clubs/[clubId]/dues/[duesId]`

- `GET /api/clubs/[clubId]/dues/[duesId]/invoice`
- `POST /api/clubs/[clubId]/dues/[duesId]/invoice`
- `PUT /api/clubs/[clubId]/dues/[duesId]/invoice`
- `PATCH /api/clubs/[clubId]/dues/[duesId]/invoice`
- `DELETE /api/clubs/[clubId]/dues/[duesId]/invoice`

- `GET /api/clubs/[clubId]/dues/[duesId]/receipt`
- `POST /api/clubs/[clubId]/dues/[duesId]/receipt`
- `PUT /api/clubs/[clubId]/dues/[duesId]/receipt`
- `PATCH /api/clubs/[clubId]/dues/[duesId]/receipt`
- `DELETE /api/clubs/[clubId]/dues/[duesId]/receipt`

- `GET /api/clubs/[clubId]/dues/unpaid`
- `POST /api/clubs/[clubId]/dues/unpaid`
- `PUT /api/clubs/[clubId]/dues/unpaid`
- `PATCH /api/clubs/[clubId]/dues/unpaid`
- `DELETE /api/clubs/[clubId]/dues/unpaid`

## 所属（Memberships）
- `GET /api/memberships`
- `POST /api/memberships`
- `GET /api/memberships/[id]`
- `PATCH /api/memberships/[id]`
- `DELETE /api/memberships/[id]`

## 資格（Qualifications）
- `GET /api/qualifications`
- `POST /api/qualifications`
- `GET /api/qualifications/[id]`
- `PATCH /api/qualifications/[id]`
- `DELETE /api/qualifications/[id]`

## 団体（Organizations）
- `POST /api/organizations/create`
- `PUT /api/organizations/[id]/update`
- `POST /api/organizations/[id]/members`
- `PUT /api/organizations/[id]/members/[memberId]`
- `DELETE /api/organizations/[id]/members/[memberId]`
- `POST /api/organizations/[id]/logo/upload`
- `DELETE /api/organizations/[id]/logo/delete`
- `PUT /api/organizations/[id]/competitions/[competitionId]/official-positions`

## 大会（Competitions）
- `POST /api/competitions/create`
- `GET /api/competitions/[id]`
- `PUT /api/competitions/[id]/update`
- `PUT /api/competitions/[id]/status`
- `PUT /api/competitions/[id]/entry-settings`
- `PUT /api/competitions/[id]/entry-fee`

### 大会：エントリー / チーム請求とクラブ個人枠請求（分離）
- `POST /api/competitions/[id]/entries`（`clubIndividualFeePaidAt`・クラブ先払い枠／締切後一括の扱い。詳細は `route.ts`）
- `POST /api/competitions/[id]/entries/[entryId]/withdraw`（本人: 個人種目の棄権申請。JSON `{ eventIds: string[]; reason?: string }`。`eventIds` 必須・1件以上。エントリー内の個人種目のみ選択可。召集締切済み種目は 400。既に棄権済みの種目はスキップし、処理対象がなければ 400）
- `POST /api/competitions/[id]/entries/[entryId]/post-pay/approve`（OrgAdmin: 未決済エントリーを後払い承認で成立）
- `POST /api/competitions/[id]/entries/[entryId]/post-pay/revoke`（OrgAdmin: 未入金のみ後払い承認を取り消し）
- `POST /api/competitions/[id]/entries/[entryId]/manual-payment`（OrgAdmin: 後払い承認済み・未入金の手動入金記録。JSON `{ note?: string }`）
- `POST /api/competitions/[id]/unpaid-intent/send-bulk`（OrgAdmin: **主催の通常操作**。未決済者への出場意思確認メール一括送信。`{ preview?: true }` または `{ responseDeadlineAt: ISO }`。送信後は参加者回答・期限後 DNS が自動）
- `POST /api/competitions/[id]/unpaid-intent/process-deadline`（期限後 DNS の手動実行。本番は Cron に任せ、OrgAdmin または `Authorization: Bearer $CRON_SECRET`・ローカル開発用）
- `GET` / `POST /api/competitions/[id]/entry/payment-intent`（トークンリンクからの出場/棄権回答・公開）
- `GET /api/cron/unpaid-entry-intent-deadline`（Vercel Cron・15分間隔・`CRON_SECRET` 必須。全大会の期限切れキャンペーンを処理）

**未決済出場意思確認の運用（本番）**: `RESEND_API_KEY` と `CRON_SECRET` を設定。主催は管理画面で回答期限＋一括送信のみ。期限後の未回答 DNS は Cron が自動適用。個別の `post-pay/approve` はメール未達などの救済用。

**ローカルで期限 DNS を試す例**:
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$E2E_BASE_URL/api/cron/unpaid-entry-intent-deadline"
# または OrgAdmin セッションで POST .../unpaid-intent/process-deadline
```
- `PUT /api/competitions/[id]/team-entries`（任意 `prepaidIndividualUserIds: string[]`。チーム種目分とクラブ個人枠分は別 `Payment.ownerId` に upsert。先払い枠の `clubPaymentId` は個人枠用 `Payment` のみ）
- `POST /api/competitions/[id]/team-billing/checkout`（JSON に `billingScope`: `"team"` | `"prepaid"`。省略時は `"team"`）
- `POST /api/competitions/[id]/team-billing/finalize`（チーム用・個人枠用の2行に分割して確定。締切後の未払い個人分は個人枠行へ）
- `GET /api/competitions/[id]/team-billing/receipt`（`billingScope=team`（既定）または `prepaid` で対象の領収書）

**移行（旧1件合算 `Payment`）**: デプロイ後にクラブが「チームエントリー保存」を実行すると、新しい2行の `Payment` に置き換わる（先払い枠は保存時に `replaceClubPrepaidSlotsForSave` で再紐付け）。保存できない期間のデータだけ別途バックフィルを検討。

### 大会：イベント
- `GET /api/competitions/[id]/events`
- `POST /api/competitions/[id]/events`
- `DELETE /api/competitions/[id]/events/[eventId]`

### 大会：公式結果
- `GET /api/competitions/[id]/events/[eventId]/official-result`
- `PUT /api/competitions/[id]/events/[eventId]/official-result`
- `GET /api/competitions/[id]/results`

### 大会：お知らせ / 添付
- `POST /api/competitions/[id]/announcements`
- `DELETE /api/competitions/[id]/announcements/[announcementId]`
- `POST /api/competitions/[id]/attachments`
- `DELETE /api/competitions/[id]/attachments/[attachmentId]`

### 大会：関係情報
- `PUT /api/competitions/[id]/relations`
- `POST /api/competitions/[id]/relations/logo`
- `DELETE /api/competitions/[id]/relations/logo`

## イベント（結果API）
- `GET /api/events/[eventId]/results`
- `POST /api/events/[eventId]/results`
- `PUT /api/events/[eventId]/results`
- `DELETE /api/events/[eventId]/results`

## 管理（Admin）
- `GET /api/admin/club-applications`
- `GET /api/admin/club-applications/[id]`
- `PATCH /api/admin/club-applications/[id]`
- `DELETE /api/admin/club-applications/[id]`
- `PUT /api/admin/clubs/[clubId]/status`
- `POST /api/admin/jla/clubs/[id]/approve`

## Webhook
- `POST /api/webhooks/stripe`（署名検証・冪等処理あり）
