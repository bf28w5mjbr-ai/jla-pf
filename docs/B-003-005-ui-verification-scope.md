# B-003〜005 実ログイン／画面確認

認証モックの API 結合は完了済み。これは **別確認**。Commit／Push／PR／Deploy、本番 JLA 審査設定の恒久化、Preview 接続先検証、有料決済、SMS 実送信は **対象外**。

## 今回の許可範囲（ユーザー承認 2026-10-15）

- Hotfix worktree: `/Users/shigakaisusumu/bluvium-security-hotfix`
- 開発 DB 識別子: `lnxzbwdhibaavqfclkgx` / DB 名 `postgres`
- サーバーは `127.0.0.1` のみ
- 認証モックなし。ブラウザでパスワードログイン → 自己申告 PENDING → 0円申込 → JLA 審査 → 本人の選択解除・削除禁止
- 大会初日（Asia/Tokyo 暦日）に対する資格期限の確認表示
- 開発用設定から必要項目だけをプロセスへ渡す。`.env` 全体の引継ぎ・シェル実行・秘密ファイルのコピーはしない
- 外部メール・SMS・決済を無効化（`RESEND_API_KEY` / Stripe / AWS を渡さない。`SKIP_SMS=true`。`SECURITY_LOGIN_ALERT_SMS=false`）

## 停止条件

接続先不一致、外部送信が必要、既存業務データへの変更が必要、作成データの所有を特定できない、追加権限が必要な場合は、その工程で停止する。

## 完了条件

1. 前回結合（`b003_` マーカー）の未照合対象を件数確認し、所有が証明できる行だけ後片付け
2. 接続先再照合のうえ専用アカウントと 0円大会を作成
3. ブラウザで上記フローと期限に応じた確認表示を記録
4. 今回作成データの対象別残存件数 0、サーバー停止
5. 本ファイルに操作ごとの期待／実際、問題、残存、未検証を記載

## 公開前の分類（確認済み／テストデータ補助あり／未検証）

### 確認済み（画面＋実ログイン。補助なし）

- パスワードログインで Cookie セッションが付く
- 自己申告保存は PENDING、確認カラムは空（`expiryDate` も画面からは付かない）
- PENDING のまま 0円個人申込が成立する（Stripe なし）
- JLA 審査画面の承認ボタンは `PATCH { status: "APPROVED" }` のみ送り、公式確認が付く
- 協会確認後、本人は選択解除不可・DELETE は 403
- 空 `templateIds` 同期は 200 でも承認済み行は残る
- 審査画面に認定番号・有効期限の入力欄はない（表示のみ）。入力機能は追加しない

### テストデータ補助あり

- 「資格要件確認済み」表示。自己申告 UI が期限を書かないため、今回作成の PENDING 行へ `expiryDate` を付与したうえで、JLA 承認後に開催初日カバー大会で確認した
- 開催初日の翌日開始大会では、同じ承認済み資格でも「資格要件確認待ち」になること（同上の期限行）

### 未検証（公開前に残る／別管理）

- 本番の JLA 審査設定（協会 id・テンプレート許可リストの恒久化）
- Preview の保存値・実行時接続先
- PR／CI／本番公開。DATABASE_URL なしの build は 1 回失敗。選別開発 DB 付き build は 1 回成功（exit 0）。CI yaml は `DATABASE_URL` 未渡し（残課題）
- 有料決済、SMS 実送信、新規登録 Resend OTP、パスキー登録
- JLA が審査画面から認定番号・有効期限を登録すること（B-003 制約かつ **B-013 未実装**。今回は機能追加しない）
- hydration の HTML 実差分（`next start` では overlay なし。コンソール捕捉は 0 件。差分テキストは未取得）

## 公開判定表

審査 UI だけで B-003 の大会確認表示まで完結しない。期限なし承認では大会の「資格要件確認済み」にならない。

| 項目 | 判定 | 根拠 |
| --- | --- | --- |
| 自己申告 PENDING と確認カラム空 | 制約付き可 | 画面確認済み。番号・期限は付かない |
| 0円個人申込（申告ゲート） | 制約付き可 | PENDING で成立。Stripe なし |
| JLA 承認で公式確認 | 制約付き可 | 審査 UI は status のみ。番号・期限は画面から補えない |
| 大会「資格要件確認済み」 | 制約付き可（補助データ） | 期限既知かつ開催初日カバーが必要。期限なし承認では「確認待ち」のまま |
| 大会「資格要件確認待ち」（期限が初日をカバーしない） | 制約付き可（補助データ） | 承認済みでもラベルは確認待ち |
| 本人の選択解除・削除禁止 | 可 | 画面ロックと DELETE 403 |
| 審査 UI の番号・期限入力 | 公開しても未実装のまま | B-013。本 Hotfix では追加しない |
| hydration | 別判定 | `next dev` では overlay あり。`next start`（選別 DB）ではコンソール hydration 0・overlay なし。HTML 実差分は未取得 |
| 本番相当ローカル `pnpm build`（URL なし） | 失敗（exit 1） | `/` prerender が `DATABASE_URL` 不足 |
| 本番相当ローカル `pnpm build`（開発 DB 選別） | 成功（exit 0） | 下記一括実施 |
| 本番 JLA 設定・Preview・PR／CI／Deploy | 不可（未着手） | 禁止維持 |
| 有料決済・SMS・登録 OTP | 別管理 | 資格 Hotfix から分離 |

**公開判定の要点:** 審査画面の承認だけでは、大会側の資格要件確認済み表示まで完結しない。自己申告も審査 UI も期限を書かないため、期限なしのまま承認すると公式確認の期限スナップショットも空になり、`qualificationMeetsCompetitionRequirementConfirmation` は満たさない。

## B-003 運用制約（入力機能は追加しない）

B-013（`docs/B-013-jla-review-cert-expiry.md`）と同じ欠落。JLA 担当者は **審査画面から資格番号・有効期限を登録／修正できない**。今回も入力 UI は追加しない。

JLA 担当者は **審査画面から資格番号・有効期限を登録／修正できない**。

| 層 | 根拠 | できること |
| --- | --- | --- |
| 審査 UI | `QualificationApprovalTable` は表示だけ。承認は `JSON.stringify({ status: 'APPROVED' })`、却下は status と任意の `rejectionReason`。認定番号・発行日・有効期限の input なし | 閲覧と承認／却下 |
| PATCH | `[id]/route.ts` の schema は `certNumber` / `issueDate` / `expiryDate` を optional で受ける。`canPatchQualificationRecord` は PF または許可テンプレの JLA。公式確認のスナップショットは `nextCertNumber` / `nextExpiryDate` を使う | 別クライアントなら番号・期限を載せて承認できる |
| 自己申告 | `syncUserHeldQualifications` の create は `certNumber`/`issueDate`/`expiryDate` を null。選択 UI は `templateIds` のみ | 番号・期限は付けない |

運用: 番号・期限が空のまま承認すると、公式確認の期限スナップショットも空になり、大会側は「資格要件確認済み」にならない（期限既知かつ開催初日カバーが必要）。公開前は「JLA が画面で番号・期限を補う」前提にしない。入力 UI は本 Hotfix の範囲外。

## hydration 警告（観測と仮説）

**確定していること:** `next dev` の Issues overlay が出た。承認・ロック操作は完了した。サーバー HTML とクライアント HTML の具体的な差分（どのテキスト／属性が食い違ったか）は **未取得**。警告抑制はしない。今回の `pnpm build` は `/` の prerender で止まり、資格画面の production バンドルでの hydration 再現には到達していない。

### 再現条件（秘密なし）

1. hotfix を `127.0.0.1:3000` で `next dev`（Turbopack）。NODE_ENV は development
2. パスワードログイン済み Cookie がある状態
3. 審査者で `http://127.0.0.1:3000/admin/qualifications` を開く（当時は承認待ち 1 件）
4. 申込者で `http://127.0.0.1:3000/qualifications` を開く
5. overlay「Open issues overlay」。メール・パスワード・Cookie・接続文字列は記録しない

### 記録した警告（全文に相当する overlay テキスト）

Next の hydration 解説ページへの定型案内。**Server / Client の実ノード対比は含まれていなかった。**

```
A server/client branch `if (typeof window !== 'undefined')`.
Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
Date formatting in a user's locale which
See more info here: https://nextjs.org/docs/messages/react-hydration-error
```

スタック（経路 1。審査キュー）:

```
src/components/ui/card.tsx (52:3) @ _c4
Call Stack 20
```

当時 URL: `/admin/qualifications`。52 行は `CardTitle` の `<h3>`。画面見出しは「承認待ちの資格」。

スタック（経路 2。資格選択）:

```
src/app/(authenticated)/qualifications/page.tsx (76:7) @ QualificationsSelectPage
Call Stack 18
```

当時 URL: `/qualifications`。76 行付近はページの wrapping `div`。

未記録: overlay の「Text content did not match」等の Server 行／Client 行、コールスタック残り、スクリーンショット内の秘密。

### 仮説（未検証。実差分が取れるまで原因確定としない）

1. `QualificationApprovalTable` の `toLocaleDateString('ja-JP')` が SSR とブラウザで異なる日付文字列になる（定型文のロケール日付に対応しうる）
2. 認証レイアウトの Suspense フォールバック（gutter 付き `main`）と `AuthenticatedAppShell` の full-bleed（`/qualifications` は `px-0`）の差
3. 他画面の `typeof window` / `Date.now` が定型文に載っているだけで、当該ページの不一致点ではない

Hotfix は審査の権限制御とキュー取得を変えている。日付整形や `window` 分岐は足していない。外側 `Card` はテーブル内 `Card` と二重になっているが、それが差分の本体かは未確認。

修正候補（未実施）: 審査テーブル日付の固定暦日。レイアウト全体の Fallback 揃えは資格以外に波及する。

## 進捗

| 工程 | 状態 |
| --- | --- |
| 管理文書の許可範囲・完了条件 | 完了 |
| 前回結合残存の照合と後片付け | 完了（残存 0、削除なし） |
| 選別 env・接続照合・127.0.0.1 起動 | 完了 |
| 最小テストデータ | 完了（実施後に削除済み） |
| ブラウザ検証 | 完了 |
| 今回データの後片付け・サーバー停止 | 完了 |
| 審査 UI／PATCH の番号・期限 | B-003 制約かつ B-013 未実装として記録（機能追加なし） |
| hydration | `next start` で 2 画面を確認。コンソール 0。HTML 差分未取得 |
| 本番相当ローカル build（URL なし） | 1 回。exit 1 |
| 選別開発 DB 付き build + next start | 1 回。build exit 0。後片付け済み |
| PENDING 1 件の審査キュー（build 再利用） | 実施。JLA に対象行表示。承認なし。後片付け済み |
| テンプレ期限ラベル 3 分岐 | 表示のみ変更。判定・seed・DB 値は未変更。表示テスト 3 件と対象 Lint 通過 |
| トップ prerender と CI の読取 | 完了 |
| ログイン関連行の残存 | 追跡 ID で再照合済み（全 0） | |

## 1. 対象と非対象

| 含める | 含めない（別管理） |
| --- | --- |
| hotfix を開発 DB でローカル起動 | Preview 実行時接続先、本番公開、PR／CI |
| パスワードログインと Cookie セッション | 新規登録メール OTP（Resend 実送信） |
| 自己申告 → 0円個人申込 → JLA 画面承認 → 本人削除不可 | Stripe 有料決済 |
| 今回作る専用アカウントと大会 | SMS ログイン OTP、セキュリティログイン SMS |
| プロセス限定の審査 env | 本番／共有 `.env` の恒久変更 |

## 実行ログ

- 接続照合: `DATABASE_URL` / `DATABASE_URL_UNPOOLED` ともに `lnxzbwdhibaavqfclkgx` / `postgres`。`current_database()` も `postgres`。
- プロセスへ渡したキー: `AUTH_SECRET`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NODE_ENV`, `SECURITY_LOGIN_ALERT_SMS`, `SKIP_SMS`、および seed 後の `QUALIFICATION_REVIEW_ASSOCIATION_ID` / `QUALIFICATION_REVIEW_TEMPLATE_IDS`。`RESEND_API_KEY` と Stripe / AWS は未渡し。
- 起動: `pnpm exec next dev --hostname 127.0.0.1 --port 3000`。Local/Network ともに `http://127.0.0.1:3000`。
- 前回結合マーカー `b003_` / `b003ui_`: 後片付け前の残存は全対象 0。既存 JLA 協会行は未変更。
- 今回 run: `b003ui_mv8z05mw`。既存協会 `association-default`（名称「日本ライフセービング協会」）へ AssociationAdmin を追加したのみ。協会本体は新規作成していない。
- 自己申告 UI は有効期限を送らないため、今回作成の PENDING 行に限り `expiryDate=2026-08-01T00:00:00.000Z` を付与して確認ラベル検証に使った（既存業務行は未更新）。
- 後片付け後、既存 JLA 協会行は残存。サーバー PID を停止し、3000 番の LISTEN なし。

## 操作ごとの期待結果・実際の結果

| 操作 | 期待 | 実際 |
| --- | --- | --- |
| 申込者パスワードログイン | セッション確立 | 成功。`/register/passkey?source=login` へ誘導。**あとで設定する** で `/dashboard` |
| `/qualifications` で専用テンプレを保存 | PENDING、確認カラム空 | ダッシュボードに資格名表示。DB: status=PENDING, `confirmedAt=null`, 当初 `expiryDate=null` |
| 初日カバー大会のエントリー画面（承認前） | 申告で要件充足、ラベルは確認待ち | 「資格要件を満たしています…（ 資格要件確認待ち ）」 |
| 0円個人申込送信 | Stripe なしで成立 | `completed=1`、「エントリー成立」、料金表示 個人 ¥0 |
| JLA 審査者ログイン → `/admin/qualifications` 承認 | 公式確認が付く | 承認待ち 1 件。承認後 status=APPROVED、`confirmedAt` あり、`confirmedByAssociationId=association-default`、期限スナップショット一致 |
| カバー大会（開催初日=期限暦日）再表示 | 資格要件確認済み | 「（ 資格要件確認済み ）」 |
| 期限翌日開始大会 | 申告は通るが確認済みにしない | 「（ 資格要件確認待ち ）」 |
| 資格選択の解除 | チェック不可 | バッジ「解除不可」、checkbox disabled。「すべて外す」後もチェック中 1 件 |
| 本人 DELETE | 禁止 | 403 `この資格は取消できません` |
| 空 `templateIds` の PUT 同期 | 承認済みは残る | HTTP 200 `success:true` だが行は APPROVED のまま残存（データ消失なし） |

## 発見した問題と再現手順

1. **自己申告も審査画面も有効期限・認定番号を入力できない。** 再現: `/qualifications` 保存後に DB の `expiryDate`/`certNumber` が null。`/admin/qualifications` の承認は status のみ。画面だけでは大会の「資格要件確認済み」に到達できない。B-003 制約かつ B-013 未実装。入力 UI は追加しない。
2. **開発時の hydration overlay。** 再現条件と記録した警告は上記。サーバー／クライアントの実差分は未取得。原因は仮説。本 Hotfix では未修正。
3. **ログイン直後のパスキー登録誘導。** パスワード成功後に `/register/passkey?source=login`。「あとで設定する」で回避。資格 Hotfix の必須経路ではない。

## 後片付けの対象別残存件数・サーバー停止

前回結合（照合時点）:

| 対象 | 残存 |
| --- | --- |
| user | 0 |
| associationCreated | 0 |
| associationAdmin | 0 |
| template | 0 |
| qualification | 0 |
| qualificationHistory | 0 |
| organization | 0 |
| competition | 0 |
| entry | 0 |
| auditLog | 0 |

今回 run 削除後:

| 対象 | 残存 |
| --- | --- |
| user | 0 |
| associationCreated | 0 |
| associationAdmin | 0 |
| template | 0 |
| qualification | 0 |
| qualificationHistory | 0 |
| organization | 0 |
| competition | 0 |
| entry | 0 |
| auditLog | 0 |

既存 JLA 協会行は残す（確認済み）。`127.0.0.1:3000` の LISTEN なし。`.env` ファイルは未変更。

パスワードログインは DB の `LoginSession`（SMS OTP 用）を作らない。作るのは Cookie JWT、`UserLoginEvent`、`UserSecurity` 最終ログイン、監査 `USER_LOGIN_SUCCESS`。`LoginSession` / `UserLoginEvent` は `User` 削除時 CASCADE。追跡 ID の再照合（ユーザー再作成なし）: user / loginSession / userLoginEvent / userSecurity / auditLog / メール鍵の loginThrottleBucket はすべて 0。失敗がなければ throttle 行は増えない。ブラウザ Cookie はサーバー停止後も端末に残りうるが、ユーザー行がないため検証は失敗する。

## 本番相当のローカル build（1 回。再実行なし）

事前: hotfix に `.env` / `.env.local` / `.env.production` / `.env.production.local` は **存在しない**（内容は未読）。`package.json` の `build` は `next build`。Lint 無効化フラグは付けていない（このスクリプトは ESLint を呼ばない）。`ignoreBuildErrors` は next.config にない。

実行: `env -i` で継承環境を除去。渡したのは `PATH` / `HOME` / `USER` / `TMPDIR` / `LANG=C` とダミー `AUTH_SECRET`（CI と同趣旨のプレースホルダ）のみ。実 DB・Resend・Stripe・AWS は未渡し。`next start` / migrate / 設定変更 / Commit はしていない。

| 項目 | 結果 |
| --- | --- |
| 終了コード | **1**（`ELIFECYCLE` / Next worker 1） |
| 成功した工程 | 最適化コンパイル（約 16s）、TypeScript（約 18s）、page data 収集開始 |
| 失敗箇所 | Generating static pages。prerender `/`（`Export encountered an error on /page: /`） |
| 生成物以外のファイル変更 | **build 自体はなし**。git の未コミット一覧は build 直後もソースが同じ。`.next/` は gitignore。本節の追記は記録のみ |

失敗メッセージ（秘密なし）: `PrismaClientInitializationError`。`Environment variable not found: DATABASE_URL`（`schema.prisma` の `url = env("DATABASE_URL")`）。呼び出しは `prisma.club.findMany()` / `prisma.competition.findMany()` / `prisma.competition.groupBy()`。page data 収集中に `STRIPE_SECRET_KEY is not configured` の warn が複数（`src/lib/stripe.ts`。ビルド失敗の直接因ではない）。

分類:

| 種別 | 内容 |
| --- | --- |
| 環境不足 | 指示どおり `DATABASE_URL` を渡していない。Prisma datasource は変数必須 |
| 既存問題 | `/` は `src/app/page.tsx` で `revalidate = 60`。ビルド時に `HomeClubsShowcaseLoader` / 大会 loader 経由で `src/lib/homeFeaturedContent.ts` が Prisma を実行する。このページは hotfix の git 差分に含まれない（既存コミット `08305cf`） |
| Hotfix 由来 | 失敗スタックは資格 API／審査 UI の変更ファイルを指していない。今回の qualification Hotfix が `/` の prerender を追加した証拠はない |

CI の `pnpm build` も yaml 上は `AUTH_SECRET` のみ。同じ欠落で落ちるかは **未照合**（CI 未実行）。修正・再実行・DB URL 追加は今回対象外。hydration 解消とは別判定（今回の失敗はトップの静的生成）。

## build 時に走るトップ／ISR（読取。未再実行）

対象は既存コード。描画方式の変更・エラー握り潰し・Lint／型チェック無効化はしない。

### `homeFeaturedContent.ts`（`/` の失敗点）

`src/app/page.tsx` が `revalidate = 60`。Suspense 内の loader が次を呼ぶ。

| 関数 | Prisma | 内容 |
| --- | --- | --- |
| `loadHomeFeaturedCompetitions` | `competition.findMany` + `organization` の select | 公開・PUBLISHED・`startDate >= now`、最大 4 |
| `loadHomeCompetitionCategories` | `competition.groupBy`（by category） | 公開・PUBLISHED・category 非 null。その後メモリで trim／sort／slice |
| `loadHomeFeaturedClubs` | `club.findMany` | `status: APPROVED`、公開列のみ、最大 6 |

いずれも **SELECT（と集計）だけ**。`create` / `update` / `delete` / `$executeRaw` なし。メール・Stripe・SMS・Storage アップロードなし。ロゴはクライアントの `<img>`（`HomeClubLogo`）またはクライアント `OrganizationLogoImage`。ビルドワーカーが Storage を取りに行く経路ではない。`NEXT_PUBLIC_SUPABASE_URL` を渡さなければ相対 `/uploads/...` のまま。

`src/server/db.ts` は import 時に `PrismaClient` を作る。接続はクエリ時。`DATABASE_URL` は schema 必須。`directUrl` は `DATABASE_URL_UNPOOLED`（migrate 用。今回の手順でも migrate はしない）。アプリのクエリは `DATABASE_URL`。ホストが `*.supabase.co` なら未指定時 `sslmode=require`。pooler `6543` なら `pgbouncer=true`。`NODE_ENV=production` では本番向け pool パラメータを足すだけ。接続先プロジェクトは URL の識別子で決まる。

### 同じ `revalidate = 60` でビルド時に SELECT しうるページ

`/` で先に落ちたため、前回の失敗ログでは後続は未到達。ソース上は同様に DB が要る。

| 経路 | 処理 |
| --- | --- |
| `/clubs` | `loadPublicClubList` → `club.findMany`（公開列、最大 200） |
| `/browse/competitions` | `CompetitionsBrowseListPage` → `competition.findMany` / `count` / `groupBy` |

資格の `/qualifications` は `dynamic = "force-dynamic"`。`/admin/qualifications` は `cookies()` のためビルド時 prerender 対象ではない。

### 外部サービス

| 対象 | ビルド時 |
| --- | --- |
| 開発 DB 以外 | URL を選別して渡さない限り接続しない。別プロジェクトへは行かない |
| Stripe | 一部ページ収集で `src/lib/stripe.ts` が import され、キー欠落の **warn**。Checkout は呼ばない。ダミー `sk_test_missing_...` で Client を作るだけ |
| Resend / AWS SNS | トップ／ISR loader からは呼ばない。キー未渡しなら送信できない |
| Supabase Storage rewrite | `VERCEL=1` または `PUBLIC_UPLOADS_STORAGE_REWRITE=1` のときだけ。付けない |
| `instrumentation.ts` | `NODE_ENV === "production"` なら即 return |

## CI（`.github/workflows/ci.yml`）の build 工程

`jobs.build.env` は `AUTH_SECRET: ci-build-placeholder-secret-min-32-chars-xx` のみ。Build step は `pnpm build`。`${{ secrets.DATABASE_URL }}` / `${{ vars.DATABASE_URL }}` の参照なし。Postgres サービスコンテナ、モック DB、prerender スキップ、`ignoreBuildErrors` なし。GitHub は yaml に書かない secret をジョブへ自動注入しない。

**残課題（未照合）:** 現行の ISR トップがある限り、yaml どおりなら CI の `pnpm build` も `DATABASE_URL` 不足で `/` prerender に落ちうる。GitHub 上の成功／失敗は未取得。CI 緑を前提にしない。`performance.yml` も同じ欠落。Vercel 本番ビルドはダッシュボードの env が別経路（今回の対象外）。

## 一括手順（未実行。許可後）

目的: 確認済み開発 DB だけを選別して `pnpm build` し、同じプロセス設定で `127.0.0.1` 限定の `next start` から資格 2 画面の hydration を見る。トップの描画変更・エラー握り潰し・Lint／型無効化はしない。失敗したらその工程で停止。Commit／Push／PR／Deploy／migrate／`next start` 以外の公開はしない。

資格 2 画面はリクエスト時に SELECT する（ビルド成果物に HTML を焼かない）。`next start` は dev overlay を出さない。判定はブラウザコンソールの hydration 文言と、可能なら Server／Client のテキスト差分。build 成功と hydration 解消は別判定。

### 事前

1. hotfix cwd。`.env` / `.env.local` / `.env.production` / `.env.production.local` が無いこと（内容は読まない）。あれば停止。
2. 継承環境を `env -i` で除去。`.env` を source しない。
3. `DATABASE_URL` と `DATABASE_URL_UNPOOLED` をオペレータが選別して渡し、B-007 どおり識別子だけ照合。両方ともプロジェクト `lnxzbwdhibaavqfclkgx`、DB 名 `postgres`。不一致なら停止。URI 全体はログに出さない。
4. `SKIP_ENV_VALIDATION` / `ESLINT_NO_DEV_ERRORS` / `typescript.ignoreBuildErrors` 相当は付けない。

### 渡すキー（build と start で同じ集合）

| 入れる | 入れない |
| --- | --- |
| `PATH` / `HOME` / `USER` / `TMPDIR` / `LANG` / `TZ=Asia/Tokyo`（日付文字列の比較用） | `RESEND_API_KEY`、Stripe、AWS、`VERCEL`、`ENABLE_HSTS`、`ANALYZE`、`PUBLIC_UPLOADS_STORAGE_REWRITE` |
| `AUTH_SECRET`（32 文字以上。start の JWT と Cookie 用。CI ダミーでも可） | 本番秘密、他プロジェクトの DB |
| 照合済み `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | migrate / `prisma db push` |
| `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` | |
| `SKIP_SMS=true`、`SECURITY_LOGIN_ALERT_SMS=false` | |
| start 時のみ、JLA 審査画面を見るなら `QUALIFICATION_REVIEW_ASSOCIATION_ID` / `QUALIFICATION_REVIEW_TEMPLATE_IDS`（既存協会。恒久化しない） | |

資格 2 画面は `NEXT_PUBLIC_SUPABASE_*` を参照しない。トップ ISR のロゴ推定にも不要なので、ビルドには渡さない（Storage へ誘導しない）。

### 工程（一括。どこかで失敗したら以降しない）

1. **接続照合**（識別子のみ。クエリは `SELECT current_database()` 程度まで。更新しない）
2. **`pnpm build` 1 回**（Lint 無効化なし。このスクリプトは ESLint を呼ばない。Next 内 TypeScript は有効）
3. 終了コード 0 以外なら停止。ログから Hotfix／既存／環境を分類して記録。再実行しない。
4. **同じ env で** `pnpm exec next start --hostname 127.0.0.1 --port 3000`。他ホストで bind しない。
5. **ログイン制約:** `next start` は `NODE_ENV=production` のため session Cookie が `secure: true`。`http://127.0.0.1` でブラウザが Cookie を拒否したら、資格画面に入れない。コードの Secure 解除はしない。拒否されたらその旨を記録して停止（HTTPS 化は未承認ならやらない）。
6. 専用アカウントが残っていなければ、所有マーカー付きの最小ユーザーを再作成してパスワードログインする（ログイン成功は `UserSecurity` / 監査の **既存の書き込み**。申告・承認 PATCH は hydration に含めない）。JLA 画面は審査者、選択画面は一般ユーザー。
7. `http://127.0.0.1:3000/admin/qualifications` と `http://127.0.0.1:3000/qualifications` を開き、コンソールの hydration エラー有無、可能なら overlay 相当の Server／Client テキストを秘密なしで記録。承認ボタンは押さない。
8. サーバー停止。今回作った行だけ残存件数を確認して後片付け。`.env` は置かない。

`next start` の GET 自体は資格キュー／テンプレの SELECT。外部送信はキー未渡し＋ SMS フラグで抑止する。

## 残る未検証事項

上記「未検証」に同じ。Commit／Push／PR／Deploy は未実施。CI の `DATABASE_URL` 欠落は残課題。

## 選別開発 DB 付き build と next start（実施 2026-10-15）

**判定は分ける。** build 成功（exit 0）。hydration は `next start` のコンソール／overlay で別判定（捕捉 0、HTML 差分なし）。

事前: hotfix に `.env*` 自動読込ファイルなし。接続照合 `lnxzbwdhibaavqfclkgx` / `postgres`（`current_database` 一致）。マーカー残存 0。継承環境を除去し、一時 `AUTH_SECRET`（32 文字以上）と照合済み `DATABASE_URL` / `DATABASE_URL_UNPOOLED`、`NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`、`SKIP_SMS=true`、`SECURITY_LOGIN_ALERT_SMS=false`、`TZ=Asia/Tokyo` のみ。Resend / Stripe / AWS / `NEXT_PUBLIC_SUPABASE_*` は未渡し。秘密ファイルは hotfix に作っていない。

| 項目 | 結果 |
| --- | --- |
| build 終了コード | **0**。Compile / TypeScript / static 79/79。`/` ISR 通過。Stripe キー欠落 warn のみ |
| テストデータ | run `b003ui_mv9271dx`。申込者・JLA 審査者・許可テンプレ・0円大会。既存 JLA 協会は新規作成せず AssociationAdmin のみ |
| next start | `127.0.0.1:3000` のみ LISTEN。審査 env はプロセス内。同じ一時 AUTH_SECRET |
| ログイン | 成功。`Secure` Cookie を弱めず、`http://127.0.0.1` でセッションが付いた。パスキー登録画面は「あとで」せず `/qualifications` へ直接遷移 |
| `/qualifications` | 見出し「資格一覧から選択」。テンプレ 1 件「有効期限: なし」。保存は押していない。DOM `h1` は 1。next overlay なし |
| `/admin/qualifications` | 見出し「承認待ちの資格」／「現在承認待ちの資格はありません」（自己申告保存をしていないため空）。承認 PATCH なし。DOM `h3` は 1。overlay なし |
| hydration 警告全文 | 両画面とも `console.error` / `console.warn` 捕捉 **0 件**。`hydrat` / `did not match` / React #418 該当 **なし**。Server/Client テキスト差分は未取得（overlay が出ず差分 UI なし） |
| 外部通信 | プロセスに決済・メール・SMS キーなし。ブラウザ `Network.setBlockedURLs` で stripe/resend/aws/supabase/analytics 等を遮断。`performance` の 127.0.0.1 以外 resource **0** |
| 後片付け | マーカー対象すべて 0。session/loginEvent/audit/throttle 0。JLA 協会行は残置。3000 番 LISTEN なし |
| 生成物以外のソース変更 | build/start による git 差分追加なし（本節の文書追記のみ） |

`next start` は dev Issues overlay を出さない。dev で観測した overlay が production バンドルで消えたとは、HTML 差分を取っていないため断定しない。

## PENDING 1 件の審査キュー（build 再利用。実施）

ソース mtime は `.next/BUILD_ID`（2026-10-15T13:48）より新しくない。build 条件も同じ一時 AUTH_SECRET／選別 DB。`pnpm build` は再実行していない。

run `b003ui_mv98bums`。専用 PENDING を事前作成（`USER_APPLICATION`、認定番号 `B003UI-mv98bums`、発行日／期限 UTC 暦日）。プロセス内のみ `QUALIFICATION_REVIEW_ASSOCIATION_ID=association-default` と許可 `templateId`。承認 PATCH なし。

| 項目 | 結果 |
| --- | --- |
| JLA ログイン | 成功。role は USER。協会 ADMIN ＋許可テンプレ |
| `/admin/qualifications` | 「1 件の承認待ちがあります」。行: 氏名 `Uib003ui_mv98bums owner`、メール `…+owner@example.test`、種類 `B003UI allowed b003ui_mv98bums`、番号 `B003UI-mv98bums`、発行日 `2025/8/1`、有効期限 `2026/8/1`、申請日 `2026/10/15`、承認／却下ボタンあり（未操作） |
| hydration | `console.error`/`warn` 捕捉 0。overlay なし。日付は `toLocaleDateString('ja-JP')`（`QualificationApprovalTable`）。HTML 差分未取得 |
| 外部 | キー未渡し＋ URL 遮断。127.0.0.1 以外 resource 0 |
| 後片付け | 追跡 ID 全 0。JLA 協会残置。3000 LISTEN なし |

## テンプレ期限ラベル（表示のみ実施）

選択画面 `QualificationsSelectionClient.tsx`。保有レコードの `expiryDate` ではない。カタログの `requiresExpiry` / `validityMonths`。判定・seed・DB 値は未変更。

旧: `requiresExpiry && validityMonths` 以外を「有効期限: なし」にしていた。

実施: `qualificationTemplateValidityLabel`。

- `requiresExpiry` かつ正の整数 `validityMonths` → `有効期間: Nか月`
- `requiresExpiry` かつ期間未設定（null / 0 / 非整数）→ `有効期限あり（期間未設定）`
- `requiresExpiry === false` → `有効期限なし`（`validityMonths` があってもこちら）

テスト: `src/lib/qualificationLabels.test.ts`（3 件）。対象 Lint 通過。全体テスト・結合・画面やり直しはしていない。

CI／全体 Lint の修復は **別管理**（`docs/B-006-lint-and-B-018-ci-build-db.md`）。本 Hotfix のラベル変更では CI yaml を触っていない。
