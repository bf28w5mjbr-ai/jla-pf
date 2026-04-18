# ネイティブ NFC（Capacitor）ビルド手順

## 依存関係

- [@capgo/capacitor-nfc](https://github.com/Cap-go/capacitor-nfc)（`pnpm add` 済み想定）
- Apple Developer でアプリ ID に **NFC Tag Reading** を有効化し、Provisioning Profile を再取得する

## 同期

```bash
pnpm cap sync
```

## iOS

1. `pnpm cap open:ios` または `ios/App/App.xcworkspace` を Xcode で開く
2. Signing & Capabilities で **Near Field Communication Tag Reading** を確認（entitlements はリポジトリに含む）
3. 実機を接続して Run（NFC はシミュレータでは検証できない）

## Android

1. `pnpm cap open:android` で Android Studio を開く
2. 実機またはエミュレータ（API 29+、NFC オン）で Run
3. `AndroidManifest.xml` に `NFC` 権限と `uses-feature` が含まれることを確認（プラグインとアプリのマージ結果）

## 検証

[docs/NFC_ACCEPTANCE.md](./NFC_ACCEPTANCE.md) と [docs/NFC_TAG_ID.md](./NFC_TAG_ID.md) を参照。
