# NFC タグ ID の扱い（クロスプラットフォーム）

## 正規化規約

アプリ・API 共通で `normalizeNfcTagId`（[src/lib/nfc/normalizeNfcTagId.ts](../src/lib/nfc/normalizeNfcTagId.ts)）を用います。

- 前後の空白を除去
- 英字は大文字
- 空白・ハイフン・コロンを除去（Web NFC の `serialNumber` がコロン区切りになるため）

DB に保存される値は常にこの正規化後の文字列です。

## 実機マトリクス（運用で埋める）

同一の物理タグについて、下表を埋めて **正規化後が一致するか** を確認してください。ずれる場合はタグ仕様・読取 API（UID のバイト順など）を追跡し、必要なら `normalizeNfcTagId` 前の変換をネイティブ側で揃えます。

| タグ種別 / メモ | Android Chrome（Web NFC serialNumber） | 正規化後 | Android（Capgo `tag.id` バイト列） | 正規化後 | iOS（Capgo 同上） | 正規化後 |
|-----------------|----------------------------------------|---------|-------------------------------------|---------|-------------------|---------|
| （例 NTAG213）  |                                        |         |                                     |         |                   |         |

## Capacitor ネイティブ

[@capgo/capacitor-nfc](https://github.com/Cap-go/capacitor-nfc) の `nfcEvent.tag.id`（バイト配列）を 16 進連結し、続けて `normalizeNfcTagId` と同じ規約で保存可能な形式にしています（[src/lib/nfc/nfcTagIdFromBytes.ts](../src/lib/nfc/nfcTagIdFromBytes.ts)）。

iOS では UID 取得のため `iosSessionType: 'tag'`（TAG Reader Session）を使用します。Entitlements に `TAG` が含まれる必要があります。
