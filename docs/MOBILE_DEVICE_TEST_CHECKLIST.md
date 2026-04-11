# Mobile Device Test Checklist (iOS / Android)

## 前提

- `android/app/google-services.json` を配置済み
- `ios/App/App/GoogleService-Info.plist` を配置済み
- サーバーに `FIREBASE_SERVICE_ACCOUNT_JSON` を設定済み
- `pnpm cap:sync` が成功している

## iOS 実機確認

1. `pnpm cap:open:ios` でXcodeを開く
2. `Signing & Capabilities` で以下を有効化
   - Push Notifications
   - Background Modes > Remote notifications
3. 実機を選択してビルド・起動
4. ログイン後に通知許可ダイアログで「許可」を選択
5. DBの `DeviceToken` に `platform=ios`, `active=true` が保存されることを確認
6. 管理者APIからテスト送信
7. 通知が端末に表示されることを確認
8. 通知タップで `linkUrl` へ遷移することを確認（指定した場合）

## Android 実機確認

1. `pnpm cap:open:android` でAndroid Studioを開く
2. 実機を選択してビルド・起動
3. Android 13+ は通知権限を許可
4. ログイン後に `DeviceToken` に `platform=android`, `active=true` が保存されることを確認
5. 管理者APIからテスト送信
6. 通知が端末に表示されることを確認
7. 通知タップで `linkUrl` へ遷移することを確認（指定した場合）

## テスト通知API（管理者限定）

- Endpoint: `POST /api/admin/notifications/test`
- Auth: `PF_ADMIN` のみ
- Body:

```json
{
  "userId": "対象ユーザーID",
  "title": "Pushテスト",
  "body": "通知テスト本文です",
  "linkUrl": "https://app.bluvium.com/dashboard"
}
```

- 成功時:
  - `Notification` テーブルに `type=MANUAL_TEST_PUSH` で保存
  - 対象ユーザーの有効トークンにPush送信

## API疎通コマンド（ローカル）

### 1) 直接curlで確認

```bash
curl -i -X POST "http://localhost:3000/api/admin/notifications/test" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<PF_ADMINのsessionトークン>" \
  -d '{
    "userId": "<通知対象ユーザーID>",
    "title": "Pushテスト",
    "body": "通知テスト本文です",
    "linkUrl": "https://app.bluvium.com/dashboard"
  }'
```

### 2) 追加済みスクリプトで確認

```bash
BASE_URL="http://localhost:3000" \
SESSION_COOKIE="<PF_ADMINのsessionトークン>" \
TARGET_USER_ID="<通知対象ユーザーID>" \
PUSH_TITLE="Pushテスト" \
PUSH_BODY="通知テスト本文です" \
PUSH_LINK_URL="https://app.bluvium.com/dashboard" \
pnpm test:push:api
```

期待結果:

- `status=201`
- `{"ok":true,...}` が返る

## 最低限の受け入れチェック

- iOS/Android どちらも通知が受信できる
- 通知タップで遷移できる
- 無効トークンが `active=false` に更新される
- 既存ログイン導線（SMS/Passkey）に影響がない
