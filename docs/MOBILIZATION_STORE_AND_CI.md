# フェーズ 5〜8: ストア・ディープリンク・CI・掲載/法務

[APP_MOBILIZATION_ROADMAP.md](./APP_MOBILIZATION_ROADMAP.md) の続き。

---

## フェーズ 5: iOS / Android の権限・エンタイトルメント・ストアフォーム

### 完了条件

- Info.plist / AndroidManifest の **実際に使う権限だけ**が残っていることのレビュー記録がある
- App Store Connect / Play Console の **データセーフティ**・**審査メモ**のたたき台がドキュメントまたは社内 Wiki にある

### iOS 現状インベントリ（コードベース）

| 項目 | ファイル | 内容 |
|------|-----------|------|
| バンドル表示名 | [ios/App/App/Info.plist](../ios/App/App/Info.plist) | `Bluvium` |
| バックグラウンド | 同上 | `remote-notification` |
| NFC 利用説明 | 同上 | `NFCReaderUsageDescription` |
| Entitlements | [ios/App/App/App.entitlements](../ios/App/App/App.entitlements) | `aps-environment`（**development** 固定 → 本番ビルドでは **release 用に production** へ切り替え手順が必要）、NFC formats |

**アクション:** Xcode の Release 用設定で `aps-environment` を `production` にする運用（スキーム・Configuration）をチームで決める。

### Android 現状インベントリ

| 権限 | ファイル |
|------|-----------|
| `INTERNET` | [android/app/src/main/AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml) |
| `NFC` | 同上 |
| `uses-feature` nfc required=false | 同上 |

### Play データセーフティ（回答のたたき台）

- **収集するデータ:** アカウント情報、決済関連、端末識別子（プッシュトークン）、大会・エントリー情報 等 — 実装に合わせて法務と突き合わせ
- **データの共有先:** Stripe、Firebase（プッシュ）、Supabase 等
- **暗号化:** 通信 TLS、保存時の方針

### 審査用メモ（たたき台）

- ログインに使う **審査用アカウント**（メール/パスワードまたは SMS 省略環境の可否）
- 課金: Stripe を利用（アプリ内課金ではなく Web 決済である旨）
- NFC を使う画面と目的（大会運用）

---

## フェーズ 6: Universal Links / App Links

### 完了条件

- 本番ドメイン（`NEXT_PUBLIC_APP_URL` / Capacitor `server.url` と一致するホスト）で次が **リダイレクトなし**で取得できる
  - `https://<host>/.well-known/apple-app-site-association`（`application/json`）
  - `https://<host>/.well-known/assetlinks.json`（`application/json`）
- iOS: Xcode **Associated Domains** に `applinks:<host>` を追加済み
- Android: `assetlinks.json` の `package_name` が `com.bluvium.app` と一致、`sha256_cert_fingerprints` に **アップロード鍵または App Signing 鍵**のフィンガープリント

### `apple-app-site-association` 例（`TEAMID` は Apple Developer の Team ID に置換）

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.bluvium.app",
        "paths": ["*"]
      }
    ]
  }
}
```

### `assetlinks.json` 例

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.bluvium.app",
      "sha256_cert_fingerprints": ["REPLACE_WITH_RELEASE_KEY_SHA256"]
    }
  }
]
```

**注意:** AASA は拡張子なし。CDN / Vercel のキャッシュで古い内容が残らないよう TTL も確認。

---

## フェーズ 7: CI と署名、テストトラック

### 完了条件

- 署名用シークレットの保管場所（GitHub Environments 等）が決まっている
- 少なくとも **Capacitor 設定が壊れていない**ことを検証する CI が存在する（本リポジトリでは手動 `workflow_dispatch`）

### GitHub Actions

- [`.github/workflows/capacitor-sync-verify.yml`](../.github/workflows/capacitor-sync-verify.yml): `pnpm install` → 最小 `out/index.html` 生成 → `cap sync`（PR 毎は重いため手動のみ推奨）

### 本番署名（別途決定すること）

- **iOS:** Distribution 証明書、App Store Connect API Key、Provisioning Profile
- **Android:** keystore、キーストアパスワード、Play App Signing の有効化
- **バージョン:** `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`（iOS）、`versionCode`（Android）の更新ルール

### テストトラック

- TestFlight（内部テスター → 外部）
- Play Internal testing → Closed → Production

---

## フェーズ 8: ストア掲載素材と法務 URL

### 完了条件

- ストア用 **短説明 / 長説明**（日本語、必要なら英語）
- **スクリーンショット**解像度一覧を満たす画像セットの所在
- **サポート URL**・**プライバシーポリシー URL**・（該当すれば）**特定商取引法**の公開 URL が固定され、**更新オーナー**（ロール）が決まっている

### アプリ内既存の法務・事業者表示（参照）

- `NEXT_PUBLIC_*` の特商法・問い合わせ先: `.env.example` および `/legal/tokushoho` 等の実装を確認

### オーナー表（記入用）

| 項目 | URL / 場所 | 更新オーナー |
|------|------------|--------------|
| プライバシーポリシー | | |
| 利用規約 | | |
| 特商法 | | |
| サポート窓口 | | |
