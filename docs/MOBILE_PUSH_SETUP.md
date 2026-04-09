# Mobile Push Setup (FCM)

## 目的

Capacitor版 iOS/Android アプリで Push 通知を有効化するための設定手順です。

## 1. Firebase プロジェクト準備

1. Firebase Console でプロジェクトを作成
2. Cloud Messaging を有効化
3. iOS と Android のアプリを追加

## 2. クライアント設定ファイル配置

- Android: `android/app/google-services.json`
- iOS: `ios/App/App/GoogleService-Info.plist`

この2ファイルは機密情報を含むため `.gitignore` 済みです。

## 3. iOS 側の必須確認

1. Xcode で `ios/App/App.xcworkspace` を開く
2. Target `App` > Signing & Capabilities で以下を有効化
   - Push Notifications
   - Background Modes > Remote notifications
3. Apple Developer 側で APNs Key を作成し、Firebase Console に登録

## 4. Android 側の必須確認

1. Android Studio で `android/` を開く
2. `android/app/google-services.json` が配置されていることを確認
3. ビルド時に `com.google.gms.google-services` が適用されることを確認

## 5. サーバー送信設定

サーバーは `FIREBASE_SERVICE_ACCOUNT_JSON` 環境変数を参照します。

JSON を1行文字列で設定してください（例: CI Secret / `.env.local`）。

必要キー:

- `project_id`
- `client_email`
- `private_key`

## 6. 動作確認

1. Webアプリにログイン（Capacitorアプリ内）
2. 通知許諾を許可
3. `POST /api/device-tokens` にトークン登録されることを確認
4. サーバーで `createNotification()` が呼ばれる操作を実行
5. 端末にPushが届くことを確認

## 7. トラブルシュート

- 通知が届かない場合:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` が正しいか
  - iOS の Capability 設定が有効か
  - デバイストークンが `DeviceToken` に保存されているか
  - 無効トークンが `active = false` になっていないか
