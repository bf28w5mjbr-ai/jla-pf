# 登録・ユーザーデータのメンテナンス

## 監査

```bash
pnpm audit:registration-data
```

## 正規化カナのバックフィル（本番ユーザー）

`@seed.local` はスキップ。重複キー衝突がある場合は更新せずレポート。

```bash
pnpm backfill:profile-normalized-kana:dry
pnpm backfill:profile-normalized-kana
```

## シードユーザーの整備

メール小文字化・`phoneVerifiedAt` 補完。

```bash
pnpm backfill:seed-user-hygiene:dry
pnpm backfill:seed-user-hygiene
```

## 期限切れ登録セッションの削除

```bash
pnpm cleanup:registration-sessions:dry
pnpm cleanup:registration-sessions
```

## 重複人物の確認

正規化後に同一キーになるユーザーを一覧。

```bash
pnpm report:duplicate-person-profiles
```

### 重複ユーザー統合（情報量が多い方を残す）

```bash
pnpm compare:user-footprint -- <keep候補> <drop候補>
pnpm merge:duplicate-users:dry -- --keep=<keepId> --drop=<dropId>
pnpm merge:duplicate-users -- --keep=<keepId> --drop=<dropId>
```

ヤハギ マサル（2026-05 監査）: **KEEP** `cmo9jt37c0003jp04ppxdtm12` (masaru13.y@gmail.com・エントリー/資格/通知あり) / **DROP** `cmoldbz7c000ijs04tvkhqv4f` (masa.y1213@icloud.com・新規登録のみ)
