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

デプロイ後にログイン済み Cookie 付き `/` で 307 のみ返ること、および `/dashboard` 初回 HTML がプロフィール先行になることを再計測する。

### Phase 2b（レイアウト DB 統合）

ベースライン時点では `/dashboard` の `$transaction`（エントリー・出席集計）が支配的と判断し、**layout / dashboard の User クエリ統合は見送り**（`getAuthenticatedLayoutUser` は軽量 select のまま維持）。
