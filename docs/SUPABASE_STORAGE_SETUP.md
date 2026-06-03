# Supabase Storage Setup

このプロジェクトは、`SUPABASE_SERVICE_ROLE_KEY` と `SUPABASE_STORAGE_BUCKET` が設定されている場合、
アップロード系 API が Supabase Storage を優先利用します（未設定時は従来どおり `public/uploads` へ保存）。

## 1) 環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`（例: `public-assets`）

### 相対パス `/uploads/...` の表示（本番）

Vercel 等では `public/uploads` がデプロイに含まれないため、DB に `/uploads/competitions/...` のまま残っている画像は 404 になります。`next.config` の **rewrite** で、本番（`VERCEL=1`）かつ上記 URL・バケットが揃っているとき、`/uploads/competitions|organizations|clubs/` を Supabase Storage の公開 URLへプロキシします。Vercel 以外の本番で同様に有効にする場合は `PUBLIC_UPLOADS_STORAGE_REWRITE=1` を設定してください。

## 2) バケット作成（SQL Editor）

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('public-assets', 'public-assets', true, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "public assets read"
on storage.objects
for select
to public
using (bucket_id = 'public-assets');
```

> サーバー側は Service Role Key で操作するため、insert/update/delete ポリシーは必須ではありません。

## 3) 既存ファイルの移行

`public/uploads` のファイルを Supabase Storage にアップロードし、DBの URL を書き換えるスクリプトを用意しています。

### Dry Run

```bash
pnpm run migrate:storage:supabase:dry
```

### 実行

```bash
pnpm run migrate:storage:supabase
```

> `package.json` の script は `node --env-file=.env.local` を使うため、`.env.local` に必要な環境変数を置けばそのまま実行できます。

## 4) 影響範囲

移行対象 URL:

- `Organization.logoUrl`
- `Club.logoUrl`
- `User.profilePhotoUrl`
- `CompetitionAttachment.fileUrl`
- `Competition.relatedOrganizations[].logoUrl`

## 5) 旧 `public/uploads` のクリーンアップ

移行後に DB 参照されていないローカルファイルだけ削除するスクリプトです。

### Dry Run

```bash
pnpm run cleanup:uploads:dry
```

### 実行

```bash
pnpm run cleanup:uploads
```

## 6) 段階移行: SMSログインのみ Supabase OTP を使う

既存の試行回数・再送クールダウン制御は API 側で維持し、OTP配送/検証だけ Supabase Auth に切り替えできます。

`.env.local` に以下を設定:

```env
USE_SUPABASE_SMS_OTP=true
```

対象API:

- `POST /api/auth/login/sms/start`
- `POST /api/auth/login/sms/verify`

