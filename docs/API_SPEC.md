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
- `POST /api/clubs`
- `POST /api/clubs/create`
- `GET /api/clubs/search`
- `POST /api/clubs/apply`
- `POST /api/clubs/[id]/join`
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
