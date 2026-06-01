# アプリ化ロードマップ（8 フェーズ）

Next.js（Bluvium）＋ [Capacitor 8](../capacitor.config.ts) 前提。プランどおり **フェーズ 1 → 8** の順で進める。各フェーズの「完了条件」と参照ファイルをここに固定する。

**手順をコマンド単位で追う場合は [APP_MOBILIZATION_WALKTHROUGH.md](./APP_MOBILIZATION_WALKTHROUGH.md) を先に開いてください。**

---

## フェーズ 1: 配布形態の確定（完了条件: 合意と手順が文書化されている）

### 採用方針（リポジトリ現状に基づく既定）

| 項目 | 内容 |
|------|------|
| シェル | Capacitor（`@capacitor/ios` / `@capacitor/android`） |
| Web の読み込み | **リモート URL**（`server.url`）。ビルド時環境変数 `CAPACITOR_SERVER_URL`、未設定時は `https://bluvium.jp` |
| `webDir` | `out`（Cap CLI がコピー先として参照。リモート運用でも `cap sync` 前に `out` にプレースホルダが必要な場合あり） |
| Bundle / Application ID | `com.bluvium.app`（[capacitor.config.ts](../capacitor.config.ts)） |
| 静的オフラインのみ | **当面採用しない**（`next export` 相当と SSR/API の整合が別プロジェクトになる） |
| Android TWA 併用 | 任意。採用する場合はフェーズ 6 のドメインと二重メンテの方針を追記 |

### ローカル〜本番の手順（開発者向け）

1. 本番 Web が指す URLと一致するよう `CAPACITOR_SERVER_URL` を設定（`.env` は Cap CLI が読む場合があるため、チームで運用方法を統一）。
2. `out` が無い場合は `mkdir -p out` のうえ、中に最低限の `index.html` を置いてから `pnpm cap:sync`（または `pnpm exec cap sync`）。
3. iOS: `pnpm cap:open:ios` → Xcode で署名・実機。
4. Android: `pnpm cap:open:android` → Android Studio で実機。

### 環境変数（Capacitor / モバイル）

リポジトリの `.gitignore` で `.env*` が除外されるため、チーム共有は Wiki 等で行い、ローカル `.env` に設定する。

| 変数名 | 説明 |
|--------|------|
| `CAPACITOR_SERVER_URL` | 任意。未設定時は [capacitor.config.ts](../capacitor.config.ts) の既定 `https://bluvium.jp` |
| `WEBAUTHN_RP_ID` | 本番 `bluvium.jp`（パスキー RP ID） |
| `WEBAUTHN_ORIGIN` | 本番 `https://bluvium.jp` |
| `NEXT_PUBLIC_APP_URL` | Capacitor と同一ホスト推奨 |
| `APPLE_TEAM_ID` | iOS AASA / webcredentials 用 |
| `ANDROID_RELEASE_SHA256` | Android assetlinks 用 |

---

## フェーズ 2: 認証・Cookie・パスキー（実機検証）

**完了条件:** 実機マトリクス（機種 × OS）でチェックし、問題は Issue に起票（テンプレは本書末尾）。

### 参照実装

- セッション Cookie: [src/app/api/auth/login/route.ts](../src/app/api/auth/login/route.ts)（`sameSite: "lax"`, `secure: production`, `path: "/"`, `httpOnly`）
- SMS ログイン完了時も同様: `src/app/api/auth/login/sms/verify/route.ts`
- Capacitor 初期化: [src/lib/capacitor/init.ts](../src/lib/capacitor/init.ts), [src/components/AppProviders.tsx](../src/components/AppProviders.tsx)
- パスキー API: `src/app/api/passkeys/`

### 検証観点（チェックリスト）

- [ ] ログイン後、同一オリジンで API が `credentials: "include"` 相当で通る（Capacitor の `server.url` オリジンと `NEXT_PUBLIC_APP_URL` の関係を確認）
- [ ] アプリをバックグラウンドにし、30 分以上放置後に復帰して操作が継続する（セッション `maxAge` は約 30 日）
- [ ] パスキー登録・認証が iOS / Android WebView で完走する（失敗時メッセージがユーザーに分かるか）
- [ ] Android 戻るキー: 履歴が無いときにアプリ終了になる挙動が許容か（[init.ts](../src/lib/capacitor/init.ts)）

---

## フェーズ 3: Stripe・PDF・外部リンク（実機検証）

**完了条件:** 決済・PDF・主要外部リンクが実機で再現手順付きで確認済み、問題は Issue 化。

### 検証観点

- [ ] Stripe Checkout（3DS 含む）が WebView で戻れる（戻り先は `stripeRedirectOrigin()` / `NEXT_PUBLIC_APP_URL` 系の設計に依存）
- [ ] 領収書・PDF API（例: `/api/entries/.../receipt` 等）の表示・ダウンロード
- [ ] `target=_blank` や Stripe 外部ドメインが CSP でブロックされていないか（[next.config.ts](../next.config.ts) の `connect-src` / `frame-src`）

---

## フェーズ 4: プッシュ本番・タップ遷移

**完了条件:** 本番 FCM/APNs から対象端末に届き、タップで意図した画面へ遷移する。

### 参照

- クライアント: [src/lib/capacitor/pushNotifications.ts](../src/lib/capacitor/pushNotifications.ts)（`linkUrl` → `window.location.assign`）
- サーバ: [src/app/api/device-tokens/route.ts](../src/app/api/device-tokens/route.ts)（POST/DELETE、`platform`: `ios` \| `android` \| `web`）
- 手順・curl 例: [docs/MOBILE_DEVICE_TEST_CHECKLIST.md](./MOBILE_DEVICE_TEST_CHECKLIST.md)

### 検証観点

- [ ] ログアウト時に端末トークンを `DELETE /api/device-tokens` で無効化する UX があるか（アプリ側から呼ぶか）
- [ ] `linkUrl` が未ログイン必須ページのときの挙動

---

## フェーズ 5〜8

詳細チェックリスト・ストア用たたき台・CI/署名・掲載/法務は **[MOBILIZATION_STORE_AND_CI.md](./MOBILIZATION_STORE_AND_CI.md)** に集約。

---

## Issue 起票テンプレ（フェーズ 2〜4）

タイトル: `[モバイル] <簡潔な症状>`

本文:

```markdown
## 環境
- 端末:
- OS バージョン:
- アプリ: Capacitor / ブラウザ PWA のどちらか
- server.url（本番URL）:

## 再現手順
1.
2.

## 期待
## 実際
## ログ / スクリーンショット
```
