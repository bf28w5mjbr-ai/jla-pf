# Supabase Database RLS

アプリのデータアクセスは Prisma 経由の直接 DB 接続が正です。`public` スキーマのテーブルは Supabase PostgREST にも露出するため、クライアント（`anon` / `authenticated`）からの REST アクセスは **RLS を有効化し、許可ポリシーを置かず、`anon` / `authenticated` / `PUBLIC` から REVOKE** して遮断します。

Prisma migrate とアプリ API は接続ロール（テーブルオーナー等）で RLS をバイパスするため、通常はアプリ動作に影響しません。

## 適用済み migration

| migration | 内容 |
|-----------|------|
| [`20260526130000_prisma_migrations_rls`](../prisma/migrations/20260526130000_prisma_migrations_rls/migration.sql) | `_prisma_migrations`（存在時のみ） |
| [`20260601120000_membership_rls`](../prisma/migrations/20260601120000_membership_rls/migration.sql) | `Membership`（一括適用前の個別対応） |
| [`20260601140000_public_schema_rls`](../prisma/migrations/20260601140000_public_schema_rls/migration.sql) | **`public` スキーマの全通常テーブル**（2026-06-01 一括） |

一括 migration は `pg_class` で `public` の `relkind IN ('r', 'p')` を列挙し、各テーブルに RLS + REVOKE を適用します。既に RLS 済みのテーブルも冪等に再実行できます。

## 新規テーブル追加時

`prisma migrate` で新しい `CREATE TABLE` を流しても **RLS は自動では付きません**。次のいずれかで対応してください。

1. **推奨**: その migration の末尾に、対象テーブル向けの 3 行（`ENABLE ROW LEVEL SECURITY` + `REVOKE` ×2）を足す。複数テーブルなら [`20260601140000_public_schema_rls`](../prisma/migrations/20260601140000_public_schema_rls/migration.sql) の `DO $$ ... $$` ブロックをコピーする。
2. **代替**: 同じ `DO` ブロックだけの maintenance migration を定期的に流す。

将来、ブラウザから Supabase Client で特定テーブルを直接読む必要が出た場合は、deny-all ではなく **意図した RLS ポリシー** をそのテーブルにだけ追加します（現状アプリは DB を Prisma のみで利用）。

## 検証

### DB（Supabase SQL Editor 等）

```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;
```

`relrowsecurity` がすべて `true` であること。

### Supabase Database Linter

ダッシュボードの Database → Linter で、`RegistrationSession` などの **Sensitive Columns Exposed**（RLS 未設定の機微カラム）が解消していること。

### アプリ smoke（Prisma 経路）

- SMS 登録: `/api/registration/start` → verify
- ログイン / OTP（`LoginSession`）
- 会員・大会など代表 API
