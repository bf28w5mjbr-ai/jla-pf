# サイト入口・ルーティング・認証（現行）

最終更新: 2026-06-01

このドキュメントは、**トップ・ログイン・公開サイト・会員エリア**の URL 挙動と UI 導線の運用基準です。  
公開データの範囲（クラブフィールド、大会タブの非公開項目など）は [`PERMISSIONS_CURRENT.md`](./PERMISSIONS_CURRENT.md) §6 を参照してください。

一次情報は各節に記載の `src/` ファイルです。

---

## 1. カバーページホストとトップ `/`

実装: [`src/app/page.tsx`](../src/app/page.tsx)

### カバーページホスト

次のホストではトップを **Bluvium 公開ランディング**（`HomeLanding` + `PublicSiteShellWrapper variant="cover"`）として配信します。

- `bluvium.jp`
- `www.bluvium.jp`
- `localhost`
- `127.0.0.1`

上記以外のホストで `/` にアクセスした場合は、`https://bluvium.jp/` へリダイレクトします。

### トップ `/` の認証別挙動

| 状態 | 挙動 |
|------|------|
| 未ログイン | **Cover シェル**で `HomeLanding` を表示（デスクトップでもサイドバー常時非表示・MENU で [`PublicSiteSidebar`](../src/components/public/PublicSiteSidebar.tsx) と同ナビ）。本文主 CTA は `/browse/competitions`・`/clubs`。開催予定大会を最大 4 件表示。ログイン・新規登録はヘッダーのみ |
| 未ログイン（他公開ルート） | **Standard シェル**（`lg` で常時サイドバー）— [`(public)/layout.tsx`](../src/app/(public)/layout.tsx) |
| ログイン済み | **`/dashboard` の HTML を 1 往復で返す**（Edge の [`src/proxy.ts`](../src/proxy.ts) で `/` を **rewrite**）。未適用時は [`redirectIfAuthenticated`](../src/lib/auth.ts) が 307 フォールバック |

### ログイン済みの早期処理（Edge）

[`src/lib/auth/earlyAuthenticatedRedirect.ts`](../src/lib/auth/earlyAuthenticatedRedirect.ts) が、カバーページホストで有効な `session` Cookie を検出したとき **ランディングの Node SSR を省略**する。JWT 検証は [`src/lib/auth/sessionEdge.ts`](../src/lib/auth/sessionEdge.ts)（Prisma 非依存）。

| パス | Edge の挙動 |
|------|-------------|
| `/` | **rewrite** → `/dashboard`（ブラウザ URL は `/` のまま。二重 RTT を避ける） |
| `/login` | **307** → `redirect` クエリ先 or `/dashboard` |

---

## 2. セッションとログイン後遷移

| 項目 | 内容 |
|------|------|
| Cookie 名 | `session`（httpOnly, `sameSite: lax`, `path: /`） |
| 形式 | JWT（`jose` / HS256） |
| 有効期限 | **30 日**（Cookie `maxAge` と JWT `exp` を一致） |

実装:

- [`src/lib/auth.ts`](../src/lib/auth.ts) — `signSession`, `verifySession`, `verifySessionCached`, `redirectIfAuthenticated`
- [`src/lib/auth/issueSessionCookie.ts`](../src/lib/auth/issueSessionCookie.ts) — ログイン成功時の Cookie 発行

### ログイン後の遷移先（`?redirect=`）

オープンリダイレクト対策のため、**同一オリジンの相対パスのみ**許可します。

- 検証: [`src/lib/postLoginRedirect.ts`](../src/lib/postLoginRedirect.ts) — `safePostLoginPath`, `appendRedirectQuery`
- サーバー（既ログインでログイン画面等を開いたとき）: `redirectIfAuthenticated(redirectParam)` → `safePostLoginPath(redirectParam) ?? "/dashboard"`
- クライアント（ログイン POST 成功後）: [`src/app/login/LoginForm.tsx`](../src/app/login/LoginForm.tsx) — `router.replace(redirectAfterLogin ?? "/dashboard")`

### `redirectIfAuthenticated` の利用箇所

| ルート | `redirectParam` |
|--------|-----------------|
| `/`（カバーホストのみ） | `null` → 常に `/dashboard` |
| `/login` | `searchParams.redirect` |

**注記**: 現行リポジトリに `/login/sms` 等の SMS 専用ログインルートはありません。パスワードリセット（`/login/forgot-password`, `/login/reset-password`）はログイン済みでもリダイレクトしません。

---

## 3. URL 挙動マトリクス

Next.js **proxy**（[`src/proxy.ts`](../src/proxy.ts)）は Supabase セッション更新と、上記のログイン済み早期リダイレクトのみ。認可ガードは App Router のルートグループと各 Server Component / API で実施します。

| URL / 領域 | 未ログイン | ログイン済み | ガード実装 |
|------------|-----------|-------------|-----------|
| `/`（カバーホスト） | ランディング | rewrite → `/dashboard`（1 往復） | [`src/proxy.ts`](../src/proxy.ts)（Edge） / [`src/app/page.tsx`](../src/app/page.tsx)（307 フォールバック） |
| `/dashboard` | → `/login` | 会員シェル（エントリー等は Suspense ストリーミング） | [`src/app/(authenticated)/layout.tsx`](../src/app/(authenticated)/layout.tsx)。ブックマーク・WebView は **直リンク推奨** |
| `/browse/competitions`, `/competitions/view/[id]`, `/clubs`, その他 `(public)/*` | 公開シェル | 公開シェル（ログイン済みは [`competitionBrowseRedirect`](../src/lib/competitionBrowseRedirect.ts) で会員 URL へ） | [`src/app/(public)/layout.tsx`](../src/app/(public)/layout.tsx) |
| `/competitions`, `/competitions/[id]`（一覧・詳細のみ） | → `/browse/competitions` 等へリダイレクト | 会員シェル | [`src/app/(authenticated)/competitions/`](../src/app/(authenticated)/competitions/) |
| `/login` | ログインフォーム | → `redirect` 先 or `/dashboard` | [`src/app/login/page.tsx`](../src/app/login/page.tsx) |
| `/register` 等（認証シェル） | フォーム | リダイレクトなし（現状） | 各 page |
| `(authenticated)/*`（`/dashboard` 以外） | → `/login` | 会員シェル | [`src/app/(authenticated)/layout.tsx`](../src/app/(authenticated)/layout.tsx) |

---

## 4. 公開サイト UI

レイアウト: [`src/app/(public)/layout.tsx`](../src/app/(public)/layout.tsx) → [`PublicSiteShellWrapper`](../src/components/public/PublicSiteShellWrapper.tsx)

- サーバーで `session` Cookie を検証し、`isLoggedIn` を [`PublicSiteShell`](../src/components/public/PublicSiteShell.tsx) に渡す

### ヘッダー ([`PublicSiteHeader.tsx`](../src/components/public/PublicSiteHeader.tsx))

| 状態 | 表示 |
|------|------|
| 未ログイン | 「新規登録」「ログイン」（`/login?redirect=` に現在パス、`/register?redirect=` 同様） |
| ログイン済み | 「ダッシュボード」（`/dashboard`） |

公開ヘッダーに **ログアウト** はありません。

### サイドバー ([`PublicSiteSidebar.tsx`](../src/components/public/PublicSiteSidebar.tsx))

- トップ `/`
- 大会 `/browse/competitions`
- クラブ `/clubs`

ダッシュボードへのリンクはサイドバーにはありません。

---

## 5. 公開ルート一覧（`(public)`）

`src/app/(public)/` 配下のページ（2026-06 時点）:

| パス | 用途 |
|------|------|
| `/browse/competitions` | 大会一覧（未ログイン向け） |
| `/competitions/view/[id]` | 大会詳細（タブ: 大会情報 / レース情報・未ログイン向け） |
| `/competitions/[id]/results/[eventId]` | 種目別公式結果（公開。氏名・クラブ名可） |
| `/competitions/[id]/start-list` | スタートリスト（主催の公開設定時） |
| `/competitions/[id]/start-list/[eventId]` | 種目スタートリスト |
| `/competitions/[id]/start-list/[eventId]/dsq` | DSQ 表示 |
| `/competitions/[id]/entry/payment-intent` | 決済インテント（フロー用） |
| `/clubs` | クラブ一覧 |
| `/clubs/view/[id]` | クラブ詳細（公開フィールドのみ） |
| `/business` | 事業者情報 |
| `/legal/tokushoho` | 特定商取引法に基づく表示 |

トップ `/` はルートグループ外の [`src/app/page.tsx`](../src/app/page.tsx) ですが、同じ `PublicSiteShellWrapper` を使用します。

---

## 6. 公開 URL と会員 URL の対比

| 用途 | 公開（未ログイン可） | 会員 `(authenticated)` |
|------|---------------------|------------------------|
| クラブ詳細 | `/clubs/view/[id]` | `/clubs/[id]`（管理・メンバー等） |
| 大会一覧・詳細 | `/browse/competitions`, `/competitions/view/[id]` | `/competitions`, `/competitions/[id]`（会員シェル） |
| 大会エントリー | 公開詳細から `withLoginRedirect` → 未ログインは `/login?redirect=...` | `/competitions/[id]/entry` ほか |
| チームエントリー | 同上 | `/competitions/[id]/team-entry` 等 |
| テクニカルオフィシャル募集 | 公開ページ上はログイン導線 | `/competitions/[id]/official-entry` |
| 公式結果（閲覧） | `/competitions/[id]/results/[eventId]`（氏名・クラブ名可） | `/competitions/[id]/results`（`viewerId` 付きペイロード。主催・PF 向け操作は別） |
| 結果管理 | — | `/competitions/[id]/results/manage` |

公開大会ヘッダーのログイン導線: [`CompetitionPublicHeaderLoader.tsx`](../src/components/competitions/browse/CompetitionPublicHeaderLoader.tsx) — `withLoginRedirect`, `signInRedirectPath`（ログイン後は会員詳細 `/competitions/[id]`）

公開クラブ API: `GET /api/public/clubs`, `GET /api/public/clubs/[clubId]`（フィールド定義: [`src/lib/clubPublicFields.ts`](../src/lib/clubPublicFields.ts)）

---

## 7. モバイル（Capacitor）

- WebView の読み込み URL: 環境変数 `CAPACITOR_SERVER_URL`、未設定時 **`https://bluvium.jp`**（[`capacitor.config.ts`](../capacitor.config.ts)）
- 詳細: [`APP_MOBILIZATION_ROADMAP.md`](./APP_MOBILIZATION_ROADMAP.md), [`MOBILIZATION_STORE_AND_CI.md`](./MOBILIZATION_STORE_AND_CI.md)

**起動時の想定**

- 未ログイン: トップまたはログイン導線（公開ランディング）
- ログイン済み（`session` Cookie あり）: 起点が `/` の場合、Edge で **`/dashboard` を rewrite**（1 往復）。WebView のブックマークは `/dashboard` 直リンク推奨

---

## 8. 変更時チェックリスト

入口・リダイレクト・公開シェルの挙動を変えた場合:

1. **本書**（`docs/SITE_ENTRY_AND_ROUTING.md`）を更新
2. 公開データ範囲に影響があれば [`PERMISSIONS_CURRENT.md`](./PERMISSIONS_CURRENT.md) §6 を更新
3. `redirectIfAuthenticated` の利用箇所を grep（`src/app/page.tsx`, `src/app/login/page.tsx` 等）
4. 権限・ロールに影響があれば [`PERMISSIONS.md`](./PERMISSIONS.md) も [`OPERATIONS_MANUAL.md`](./OPERATIONS_MANUAL.md) の変更管理ルールに従い更新

関連コードの grep 例:

```bash
rg redirectIfAuthenticated src/
rg isCoverPageHost src/
find src/app/\(public\) -name page.tsx
```
