# 表示速度ベースライン（bluvium.jp）

計測日: 2026-06-01  
コマンド: `BASE_URL=https://bluvium.jp node scripts/measure-ttfb.mjs -n 5 --warmup 1 <path>`

## 改善前（Phase 1 実装前）

| パス | 認証 | HTTP | TTFB avg | TTFB min–max | total avg |
|------|------|------|----------|--------------|-----------|
| `/` | なし | 200 | 542.9 ms | 401.7–762.0 ms | 591.9 ms |
| `/login` | なし | 200 | 403.7 ms | 373.0–478.5 ms | 425.2 ms |
| `/dashboard` | なし（未ログイン時は login へ） | 200 | 733.4 ms | 658.7–819.2 ms | 756.8 ms |

ログイン済み `/`（302 → `/dashboard`）は `CURL_EXTRA_ARGS` に `session` Cookie を付けて再計測する。

```bash
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  BASE_URL=https://bluvium.jp node scripts/measure-ttfb.mjs -n 5 --warmup 1 /
```

## 改善後（コードマージ後・本番デプロイ前の参考計測 2026-06-01）

本番は未デプロイのため Edge 早期リダイレクトは未反映。未ログイン `/` のみ再計測:

| パス | HTTP | TTFB avg | total avg |
|------|------|----------|-----------|
| `/` | 200 | 400.6 ms | 459.1 ms |
| `/dashboard` | 200 | 650.9 ms | 670.5 ms |

デプロイ後にログイン済み Cookie 付き `/` で rewrite（200・ダッシュボード HTML）となること、および `/dashboard` 初回 HTML がプロフィール先行になることを再計測する。

### Phase 2b（レイアウト DB 統合）

ベースライン時点では `/dashboard` の `$transaction`（エントリー・出席集計）が支配的と判断し、**layout / dashboard の User クエリ統合は見送り**（`getAuthenticatedLayoutUser` は軽量 select のまま維持）。

---

## ダッシュボード高速化（2026-06 実装）

### 変更概要

| 施策 | 内容 |
|------|------|
| Edge | ログイン済み `GET /` を 307 ではなく **rewrite → `/dashboard`**（ブラウザ往復 1 回） |
| TO バナー | クラブ ADMIN 以外は `listClubAdminTechnicalOfficialAlerts` をスキップ |
| DB | `CompetitionEntry` に `@@index([userId, createdAt(sort: Desc)])` |
| クエリ | ダッシュボード直近エントリー: 種目は `entry.items` の eventId のみ取得、`checkoutSessions` は `take: 3` |
| キャッシュ | `qualificationTemplate.findMany` を `unstable_cache`（300s） |

### 計測コマンド（ログイン済み）

```bash
# 本番・ステージング（session JWT を差し替え）
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  BASE_URL=https://bluvium.jp pnpm measure:ttfb -- -n 5 --warmup 1 / /dashboard

# ローカル本番ビルド推奨
pnpm build && pnpm start
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  BASE_URL=http://localhost:3000 pnpm measure:ttfb -- -n 5 --warmup 1 / /dashboard
```

### 改善後（ローカル・未ログイン参考 / デプロイ後に Cookie 付きを追記）

| パス | 認証 | 備考 |
|------|------|------|
| `/` | ログイン済み | rewrite のため **200**・URL は `/` のままダッシュボード HTML |
| `/dashboard` | ログイン済み | 直リンク・ヘッダー導線 |

デプロイ後: 上記 Cookie 付き計測結果をこの節の表に TTFB avg を追記する。

実装マージ直前の本番参考（未ログイン・`-L` 追従）: `/dashboard` TTFB avg **676.9 ms**（2026-06-01・3 回計測）。

---

## ダッシュボード高速化（2026-06 第2弾）

計測日: 2026-06-03（実装マージ直後）

### 変更概要

| 施策 | 内容 |
|------|------|
| RSC 並列化 | `DashboardMainDeferred` を [`page.tsx`](../src/app/(authenticated)/dashboard/page.tsx) 直下の第 3 `Suspense` に昇格（プロフィール完了を待たずエントリー・経歴クエリ開始） |
| 読み取りクエリ | [`DashboardMainDeferred.tsx`](../src/app/(authenticated)/dashboard/_components/DashboardMainDeferred.tsx): `prisma.$transaction` → `Promise.all`（entries / 出席 preview / 出席集計を並列） |
| TO バナー | [`listClubAdminTechnicalOfficialAlerts`](../src/lib/technicalOfficialQueries.ts): 充足人数を chunk 12 の `Promise.all` で並列化（`listTechnicalOfficialShortagesForCompetition` と同パターン） |

### 参考計測（ローカル `pnpm dev`・Cookie なし）

`BASE_URL=http://localhost:3000 node scripts/measure-ttfb.mjs -n 3 --warmup 1 /dashboard`

| パス | HTTP | TTFB avg | TTFB min–max | total avg | 備考 |
|------|------|----------|--------------|-----------|------|
| `/dashboard` | 200 | 73.2 ms | 61.7–84.6 ms | 76.2 ms | dev・未ログイン。本番ログイン済み比較には不向き |

### デプロイ後に追記する計測（ログイン済み・推奨）

```bash
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  BASE_URL=https://bluvium.jp pnpm measure:ttfb -- -n 5 --warmup 1 /dashboard
```

本番ビルド比較:

```bash
pnpm build && pnpm start
CURL_EXTRA_ARGS='["-H","Cookie: session=YOUR_JWT"]' \
  BASE_URL=http://localhost:3000 pnpm measure:ttfb -- -n 5 --warmup 1 /dashboard
```

期待: ログイン済み初回 HTML でプロフィールとエントリー/経歴ブロックのストリーム差が縮む。クラブ ADMIN は TO バナー壁時間がペア数に対しチャンク単位になる。
