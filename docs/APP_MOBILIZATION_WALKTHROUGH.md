# アプリ化：手取り足取り手順書

この文書は **誰が何をどの順で実行するか** を具体化したチェックリストです。背景と参照実装は次を併読してください。

- [APP_MOBILIZATION_ROADMAP.md](./APP_MOBILIZATION_ROADMAP.md)（8 フェーズの概要・Issue テンプレ）
- [MOBILIZATION_STORE_AND_CI.md](./MOBILIZATION_STORE_AND_CI.md)（ストア・AASA・CI）
- [MOBILE_DEVICE_TEST_CHECKLIST.md](./MOBILE_DEVICE_TEST_CHECKLIST.md)（プッシュ実機）

---

## 事前準備（初回だけ）

1. **PC に入れるもの**
   - Node.js 20 系、[pnpm](https://pnpm.io/)（本リポジトリは `packageManager: pnpm@10.20.0`）
   - **iOS 用:** macOS、Xcode、Apple Developer アカウント（実機に載せるなら必須）
   - **Android 用:** Android Studio、USB デバッグ可能な実機（またはエミュレータ）

2. **リポジトリを取る**

```bash
git clone <リポジトリURL>
cd jla-pf
```

3. **依存関係**

```bash
pnpm install
```

4. **Web アプリ単体が動くか（任意だが推奨）**

- `.env` または `.env.local` に `DATABASE_URL` / `AUTH_SECRET` 等を入れる（[README.md](../README.md) のセットアップ節）。
- `pnpm dev` を起動し、ブラウザで `http://localhost:3000` にアクセスしてログインできることを確認する。
- ここで動かないと、Capacitor 側の切り分けが難しくなる。

---

## フェーズ 1: 配布 URL とネイティブプロジェクトの準備

### 1-1. チームで URL を一つに決める

- **決める:** アプリの WebView が開く URL（例: 本番 `https://app.bluvium.com`、検証ならステージング URL）。
- **根拠:** [capacitor.config.ts](../capacitor.config.ts) の `server.url` は、環境変数 `CAPACITOR_SERVER_URL` が無いとき既定で `https://app.bluvium.com` になる。

### 1-2. ローカル環境変数（各自のマシン）

- プロジェクト直下の **`.env`** に、検証 URL を使う場合は次を追記する。

```bash
CAPACITOR_SERVER_URL=https://あなたが開きたいホスト
```

- **注意:** [.gitignore](../.gitignore) で `.env*` が無視されることが多いので、**チーム共有は Wiki や秘密管理ツールのテンプレ**に同じ行を貼る。

### 1-3. `out` フォルダと `cap sync`

リポジトリ**ルート**で、次を **この順**で実行する。

```bash
mkdir -p out
printf '%s\n' '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>cap</title></head><body></body></html>' > out/index.html
pnpm exec cap sync
```

- **成功の目安:** ターミナルに `Sync finished` のような完了ログが出る。`android/` と `ios/` へのコピーが走る。
- **失敗したら:** Node 20 か、`out/index.html` が存在するか、`pnpm install` 済みかを確認する。

### 1-4. Xcode（iOS）

```bash
pnpm cap:open:ios
```

1. Xcode が開いたら、左のプロジェクト **App** を選ぶ。
2. **Signing & Capabilities** で **Team** を選ぶ。Bundle Identifier が `com.bluvium.app`（またはチームで決めた ID）か確認する。
3. 上部の実行ターゲットで **実機** を選び、**Run（▶）** でビルド・起動する。
4. 初回は iOS の「開発元を信頼」などの手順が出るので、画面の指示どおりに進める。

### 1-5. Android Studio（Android）

```bash
pnpm cap:open:android
```

1. 実機を USB 接続し、端末側で **USB デバッグ** を有効にする。
2. Android Studio 上部で実機を選び、**Run** する。
3. アプリ起動後、WebView 内に **フェーズ 1 で決めた URL** のサイトが表示されることを確認する。

**フェーズ 1 完了ライン:** 実機で Bluvium の画面が開き、未ログインのトップまたはログイン画面まで到達できる。

---

## フェーズ 2: ログイン・セッション・パスキー（実機）

**前提:** フェーズ 1 でアプリから対象 URL が開けていること。

### 2-1. メール＋パスワードログイン

1. アプリ内 WebView でログイン画面を開く。
2. 既知のテストユーザーでログインする。
3. **ダッシュボードなど別ページへ遷移**する。
4. アプリを **ホームボタンでバックグラウンド**にし、30 秒〜1 分待つ。
5. 再度アプリを開き、**ログインが維持されているか**（ログイン画面に戻されていないか）を確認する。

参照: セッション Cookie は [src/app/api/auth/login/route.ts](../src/app/api/auth/login/route.ts)（`sameSite: "lax"` 等）。

### 2-2. SMS ログイン（環境で有効なら）

- 上と同様に「ログイン → 遷移 → バックグラウンド → 復帰」でセッションが切れないか確認する。

### 2-3. パスキー

1. プロフィールまたはログイン周りから **パスキー登録**を試す。
2. 登録後、ログアウトして **パスキーでログイン**できるか試す。
3. 失敗したら画面のエラー文言をメモし、[APP_MOBILIZATION_ROADMAP.md](./APP_MOBILIZATION_ROADMAP.md) 末尾の Issue テンプレで起票する（端末名・OS・開いている URL を必ず書く）。

API 実装の場所: `src/app/api/passkeys/` 配下。

### 2-4. Android の戻るキー

1. ログイン後、いくつか画面を進む。
2. **戻るキー**を何度か押す。
3. 履歴がなくなったとき **アプリが終了する**挙動になるか確認する（[src/lib/capacitor/init.ts](../src/lib/capacitor/init.ts)）。許容できなければ Issue に期待挙動を書く。

**フェーズ 2 完了ライン:** [APP_MOBILIZATION_ROADMAP.md](./APP_MOBILIZATION_ROADMAP.md) のフェーズ 2 チェックボックスが実機で埋まる、または Issue に切り分け済み。

---

## フェーズ 3: Stripe・PDF・外部リンク（実機）

### 3-1. Stripe Checkout

1. **テスト用の大会エントリー等**から Stripe Checkout を開始する（本番課金を避けるなら Stripe テストモードとテストカードを使う）。
2. 支払い完了まで進め、**WebView 内で完了画面に戻れるか**を見る。
3. 3DS が出るカードなら、**3DS 完了後もアプリに戻れるか**を確認する。

### 3-2. 領収書 PDF

1. 領収書が出る導線から **PDF を開く / ダウンロード**する。
2. iOS の Files や Android のダウンロードにファイルが残るか、または WebView 内表示になるかを確認する。

### 3-3. 外部リンク

1. サイト内の外部リンクをタップする。
2. **真っ白・読み込み失敗**がないか、取り直し用に **画面録画**を残す。

CSP 関連: [next.config.ts](../next.config.ts) の `buildContentSecurityPolicy`。

**フェーズ 3 完了ライン:** 主要フローが実機で再現でき、問題は Issue 化済み。

---

## フェーズ 4: プッシュ通知（実機）

[MOBILE_DEVICE_TEST_CHECKLIST.md](./MOBILE_DEVICE_TEST_CHECKLIST.md) を **上から順に**実行する。

### 4-0. ファイルとサーバ（担当者が一度セットアップ）

- `android/app/google-services.json` を Firebase から取得して配置する。
- `ios/App/App/GoogleService-Info.plist` を同様に配置する。
- サーバ（Vercel 等）に **`FIREBASE_SERVICE_ACCOUNT_JSON`** が入っていることを確認する。
- 再度 `pnpm exec cap sync` を実行してから Xcode / Android Studio を開き直す。

### 4-1. iOS

1. `pnpm cap:open:ios` → **Signing & Capabilities** で **Push Notifications** と **Background Modes > Remote notifications** を有効化する。
2. 実機ビルド → ログイン → 通知を **許可**する。
3. DB の `DeviceToken` に `platform=ios`, `active=true` が入ったか確認する（Prisma Studio や SQL）。
4. `POST /api/admin/notifications/test` でテスト送信する（チェックリストの `curl` または `pnpm test:push:api`）。**PF_ADMIN のセッション Cookie**が必要。
5. 通知タップで `linkUrl` の画面へ遷移するか確認する。

### 4-2. Android

- 上と同様。Android 13 以降は **通知権限**を別途許可する。

### 4-3. ログアウトとトークン

- ログアウト後に **`DELETE /api/device-tokens`** をクライアントから呼ぶかコードで確認する（[src/app/api/device-tokens/route.ts](../src/app/api/device-tokens/route.ts)）。未実装なら Issue に起票する。

**フェーズ 4 完了ライン:** iOS/Android の両方で「届く」「タップで遷移」が確認できる。

---

## フェーズ 5: ストア向け権限・審査メモ

1. [ios/App/App/Info.plist](../ios/App/App/Info.plist) の **NFCReaderUsageDescription** など、ユーザーに見える日本語が審査で問題ないか読む。
2. [ios/App/App/App.entitlements](../ios/App/App/App.entitlements) の **`aps-environment`** を確認する。`development` のままでは本番プッシュに不向きなため、**Release / TestFlight / App Store 用**に `production` へ切り替える手順を Wiki に 1 ページ書く（Xcode の Configuration と合わせる）。
3. [android/app/src/main/AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml) の `uses-permission` を一覧化し、[MOBILIZATION_STORE_AND_CI.md](./MOBILIZATION_STORE_AND_CI.md) のデータセーフティたたき台に転記する。
4. **審査用アカウント**（メール＋パスワード）を 1 組用意し、ストアの審査メモに貼れる場所に安全に保存する。

---

## フェーズ 6: Universal Links / App Links

1. **本番ホスト**を決める（例: `app.bluvium.com`）。フェーズ 1 の URL と **同じホスト**にすると運用が楽。
2. ブラウザの **シークレット窓**で次を開き、**JSON がそのまま表示される**（302 で別 URL に飛ばない）ことを確認する。
   - `https://<ホスト>/.well-known/apple-app-site-association`
   - `https://<ホスト>/.well-known/assetlinks.json`
3. 未配置なら、[MOBILIZATION_STORE_AND_CI.md](./MOBILIZATION_STORE_AND_CI.md) の JSON 例をコピーし、`TEAMID` と証明書 SHA256 を埋めて配信する（Vercel 静的ファイルまたは Next Route。インフラ担当と分担を決める）。
4. Xcode の **Signing & Capabilities > Associated Domains** に `applinks:<ホスト>` を追加する。
5. Android は `assetlinks.json` の `sha256_cert_fingerprints` を **Play App Signing** の証明書で取り直す（キーストア作成後）。

---

## フェーズ 7: CI と署名・テスト配布

### 7-1. GitHub Actions（コードが GitHub の場合）

1. リポジトリの **Actions** タブを開く。
2. 左の **「Capacitor sync verify」** を選ぶ（[.github/workflows/capacitor-sync-verify.yml](../.github/workflows/capacitor-sync-verify.yml)）。
3. **Run workflow** を押し、完了まで待つ。失敗したらログ全文を Issue に貼る。

### 7-2. 署名と配布（初回は手動でよい）

- **iOS:** App Store Connect にアプリを作成 → Xcode で **Archive** → Organizer から **TestFlight** にアップロード。
- **Android:** Android Studio で **Generate Signed Bundle** → Play Console の **Internal testing** にアップロード。
- **バージョン:** 次回から上げるルール（iOS の Build、Android の `versionCode`）を Wiki に 3 行で書く。

---

## フェーズ 8: ストア掲載と法務 URL

1. [MOBILIZATION_STORE_AND_CI.md](./MOBILIZATION_STORE_AND_CI.md) 末尾の **オーナー表**を埋める（プライバシー・利用規約・特商法・サポート）。
2. App Store Connect / Play Console に、**短い説明・長い説明**のドラフトを貼る。
3. **スクリーンショット**を、各ストアが要求する解像度で用意する（実機のスクショをトリミングしてもよい）。
4. 公開中の **特商法**（例: `/legal/tokushoho`）の URL をストアの法的 URL 欄にコピーする。環境変数 `NEXT_PUBLIC_*` の説明は README を参照。

---

## 困ったときの優先順位

1. **Web がブラウザで動くか**（`pnpm dev` または本番 URL）
2. **`pnpm exec cap sync` が通るか**
3. **実機で URL が開くか**（フェーズ 1）
4. **ログインが維持されるか**（フェーズ 2）
5. **プッシュ**（フェーズ 4）

この順で切り分けると、原因が「ネイティブ」「Web」「サーバ」のどこかに寄りやすい。
