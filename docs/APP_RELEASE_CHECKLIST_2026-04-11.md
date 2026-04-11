# App Release Checklist (Deadline: 2026-04-11)

## Goal

4/11 までに iOS / Android を配信可能状態にする。

---

## 0. Current baseline (already done)

- Capacitor導入済み（`ios/`, `android/` 生成済み）
- Push基盤実装済み（`DeviceToken`, 管理者テストAPI, FCM送信）
- Firebaseクライアント設定配置済み
  - `android/app/google-services.json`
  - `ios/App/App/GoogleService-Info.plist`
- `FIREBASE_SERVICE_ACCOUNT_JSON` 設定済み

---

## 1. Schedule (must keep)

### 3/24 - 3/31: Feature freeze prep

- [ ] 必須機能のみ継続実装
- [ ] 新規仕様追加を止める（4/11後に回す）
- [ ] 主要導線の毎日スモークテスト

### 4/1 - 4/5: Bug-fix window

- [ ] 重大/高優先バグのみ修正
- [ ] Push受信確認（iOS/Android）
- [ ] 認証導線（SMS/Passkey）回帰確認

### 4/5: Release Candidate freeze

- [ ] RCブランチを固定
- [ ] DB migration確定
- [ ] 環境変数・本番設定の最終確認

### 4/6 - 4/8: Store submission

- [ ] iOS Archive & Upload
- [ ] Android AAB Upload
- [ ] ストア審査提出

### 4/9 - 4/11: Review 대응

- [ ] 差し戻し対応
- [ ] 最終公開（段階ロールアウト推奨）

---

## 2. Functional go/no-go checks

### Auth / session

- [ ] ログイン成功（メール or SMS）
- [ ] セッション維持（再起動後も継続）
- [ ] ログアウト動作

### Core flows

- [ ] ダッシュボード表示
- [ ] 大会一覧 -> 詳細 -> エントリー導線
- [ ] 管理画面の主要操作（権限判定含む）

### Push notifications

- [ ] 初回通知許可ダイアログ表示
- [ ] `DeviceToken` 登録（`active=true`）
- [ ] `POST /api/admin/notifications/test` が `201`
- [ ] 通知受信
- [ ] 通知タップで `linkUrl` 遷移

---

## 3. iOS release steps (TestFlight -> Release)

1. `pnpm cap:sync`
2. `pnpm cap:open:ios`
3. Xcode: Signing & Capabilities
   - [ ] Push Notifications ON
   - [ ] Background Modes > Remote notifications ON
4. 実機で最終スモークテスト
5. Product -> Archive
6. Organizer -> Distribute App -> App Store Connect -> Upload
7. App Store Connectで
   - [ ] Build選択
   - [ ] Export Compliance設定
   - [ ] Privacy情報確認
   - [ ] Submit for Review

---

## 4. Android release steps (Internal test -> Production)

1. `pnpm cap:sync`
2. `pnpm cap:open:android`
3. Build -> Generate Signed Bundle / APK
   - [ ] Android App Bundle (AAB) 作成
4. Play Console
   - [ ] Internal testing にアップロード
   - [ ] テスター確認
   - [ ] 問題なければ Production へ Promote

---

## 5. Store metadata checklist

- [ ] アプリ説明文（JP）
- [ ] スクリーンショット（iOS/Android必要サイズ）
- [ ] アイコン
- [ ] プライバシーポリシーURL
- [ ] サポートURL
- [ ] 連絡先メール
- [ ] 年齢レーティング回答

---

## 6. Commands for final verification

```bash
# 1) 開発サーバー
pnpm dev

# 2) Capacitor同期
pnpm cap:sync

# 3) 管理者テスト通知API（PF_ADMINセッションで）
BASE_URL="http://localhost:3000" \
SESSION_COOKIE="<PF_ADMIN session token>" \
TARGET_USER_ID="<target user id>" \
PUSH_TITLE="Pushテスト" \
PUSH_BODY="通知テスト本文です" \
PUSH_LINK_URL="https://app.bluvium.com/dashboard" \
pnpm test:push:api
```

---

## 7. Risk controls

- 審査遅延リスク:
  - [ ] 4/7までに提出完了（バッファ確保）
- 差し戻しリスク:
  - [ ] WebViewアプリ審査コメントを事前準備
  - [ ] Pushなどネイティブ機能利用を明記
- リリース事故リスク:
  - [ ] Androidは段階ロールアウト
  - [ ] DBバックアップ確認

---

## 8. Final release gate

以下がすべて満たされたら配信可:

- [ ] iOS/Androidで主要導線の通し確認完了
- [ ] Push受信・遷移確認完了
- [ ] 重大バグ（P0/P1）0件
- [ ] ストア審査提出完了
- [ ] ロールバック手順確認済み
