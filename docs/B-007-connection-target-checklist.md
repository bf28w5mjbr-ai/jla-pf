# B-007 開発・Preview 接続先確認

機能・環境設定は変更しない。この文書は確認手順と記入表のみ。
値の取得・読込、実 DB 接続、設定変更、SQL 適用はまだ行わない。

## 1. 証拠になるもの / ならないもの

接続先が分かれていることの証拠にするのは、次だけである。

- Supabase のプロジェクト識別子（Reference ID。ホスト名 `db.<ref>.supabase.co` の `<ref>`、または pooler 利用時のユーザ名 `postgres.<ref>` の `<ref>`）
- 使っている場合のみ: Supabase ブランチ名
- 使っている場合のみ: データベース名（URI のパス。多くの場合 `postgres`）

次は **DB 分離の証拠にしない**。同じプロジェクトへの別経路・別ラベルでありうる。

- Vercel の環境名（Preview / Production / Development）
- 変数名（`DATABASE_URL` と `DATABASE_URL_UNPOOLED`）
- Transaction pooler と Direct の違い（ポート 6543 / 5432、ホストが `*.pooler.supabase.com` か `db.*.supabase.co` か）

同一環境の「接続用」と「migration 用」が pooler と Direct で分かれていても、プロジェクト識別子が同じなら同一 DB を指している可能性が高い。分離判定はプロジェクト識別子（必要ならブランチ・DB 名）の比較で行う。

## 2. 照合する URL の役割（ソース）

`prisma/schema.prisma` の datasource:

- 接続用: `url` ← 環境変数 `DATABASE_URL`（アプリの Prisma Client。`src/server/db.ts` もこちら）
- migration 用: `directUrl` ← 環境変数 `DATABASE_URL_UNPOOLED`（Prisma migrate が使う想定）

開発・Preview のそれぞれで、両 URL の識別情報を取る。片方だけでは不足する。

## 3. 秘密を出さずに識別情報だけ取る方法（今回は実行しない）

対象の URI を画面に出さない。パスワード、ユーザ名全体、クエリ文字列、URI 全体は記録しない。

記録してよい項目:

| 項目 | 取り方 |
| --- | --- |
| プロジェクト識別子 | Direct ホスト `db.<ref>.supabase.co` の `<ref>`。pooler ホストだけでは足りないことが多く、そのときはユーザ名が `postgres.<ref>` 形式なら `<ref>` のみ |
| ブランチ | Supabase ダッシュボードの Branch。URI から取れない場合はダッシュボードのみ |
| データベース名 | URI のパス（先頭 `/` を除く）。クエリは見ない |
| ポート | 接続方式の参考にはなるが、分離の証拠には使わない |

ダッシュボード優先（ローカル `.env` を開かない）:

1. 開発用 Supabase: Project Settings の Reference ID、Project name、Branch / Database 名
2. 開発用ローカル: ファイルの有無だけ確認する（`.env` / `.env.local`）。中身は開かない。識別情報は、別途オペレータがマスク表示できるときだけ記入する
3. Preview: Vercel の Environment Variables で Preview 向け `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の **識別情報だけ** をダッシュボードから読む。値のコピー・ログ出力はしない

後でローカルからパースする場合の形（**実行禁止。`.env` を読ませない**）。URI は引数で渡し、標準出力は識別情報のみ。

```bash
node --input-type=module -e '
const raw = process.argv[1];
if (!raw) { console.error("missing url"); process.exit(1); }
let rest = raw.replace(/^postgresql(s)?:\/\//, "");
const at = rest.lastIndexOf("@");
if (at < 0) { console.error("unparseable"); process.exit(1); }
const userinfo = rest.slice(0, at);
const hostpart = rest.slice(at + 1);
const user = userinfo.split(":")[0];
const [hostport, pathAndQuery = ""] = hostpart.split("/");
const [host, port = ""] = hostport.split(":");
const db = pathAndQuery.split("?")[0];
const refFromHost = host.match(/^db\.([^.]+)\.supabase\.co$/i)?.[1] ?? "";
const refFromUser = user.match(/^postgres\.([a-z0-9]+)$/i)?.[1] ?? "";
console.log(JSON.stringify({
  projectRef: refFromHost || refFromUser || "(not in host/user)",
  branch: "(dashboard only unless known)",
  database: db || "(none)",
  host: host,
  port: port,
}, null, 2));
'
```

`host` / `port` は記録用の補助。分離判定には `projectRef`・ブランチ・`database` を使う。

## 4. GitHub Environments と Vercel Git 連携（ソース確認）

`.github/workflows/` で job に `environment:` を付けているのは **`deploy-canary.yml` のみ**。

| 経路 | ソース上の事実 | Preview / ローカル開発との関係 |
| --- | --- | --- |
| GitHub Actions CI（`ci.yml`） | `environment:` なし。ダミー `AUTH_SECRET` のみ。`DATABASE_URL` なし。migrate / deploy なし | 接続先確認の対象外 |
| GitHub Environments（`deploy-canary.yml`） | `environment: ${{ github.event.inputs.environment \|\| 'staging' }}`。`main` push または `workflow_dispatch`。vars: `MIGRATE_COMMAND` / `DEPLOY_COMMAND` / `HEALTHCHECK_URL` / `ROLLBACK_COMMAND`。secret: `DEPLOY_TOKEN`。選択肢は staging / canary / production | **Preview デプロイやローカル開発の DB を指す根拠にしない**。この workflow は GitHub Environment 経由の migrate→deploy→health 用 |
| Vercel Git 連携 | リポジトリ内は `vercel.json` の cron 定義のみ。Preview 用 DB や Git 連携の有効/無効はソースに無い | PR Preview の接続先は Vercel プロジェクトの Preview 環境変数で見る。GitHub Environments の staging/canary/production と同一視しない |

GitHub Environment 名が Preview であること、変数名が分かれていることは、開発用プロジェクトと Preview 用プロジェクトが別であることの証拠にしない。

## 5. 確認表

記入ルール: 未実施の欄は空欄または「未確認」のままにする。推測で埋めない。
`lnxzbwdhibaavqfclkgx` は **ローカル設定内の一致を確認済み**。Cursor 自身のダッシュボードログイン確認は未実施（サインイン画面で停止）。プロジェクト名と対応 URL は **ユーザー提供画像** で確認し、ユーザーが **今回新設した開発専用プロジェクト** と明言済み。これは Cursor のダッシュボード操作による確認ではない。

| 対象 | URL の役割 | 期待する接続先（プロジェクト識別子 / ブランチ / DB 名） | 確認した接続先 | 根拠 | 未確認 |
| --- | --- | --- | --- | --- | --- |
| 開発（ローカル） | 接続用 `DATABASE_URL` | ユーザー指定: `lnxzbwdhibaavqfclkgx` / DB `postgres`（名称 `bluvium-development`） | `lnxzbwdhibaavqfclkgx` / `postgres` | 接続直前に `.env` の識別子・DB名を照合し一致。名称と URL はユーザー提供画像。ユーザーが開発専用新設と明言。Cursor のダッシュボード確認ではない | Supabase ブランチ名（URI に無い） |
| 開発（ローカル） | migration 用 `DATABASE_URL_UNPOOLED` | 同上 | `lnxzbwdhibaavqfclkgx` / `postgres`。`current_database() = postgres` | 同上。識別子一致後にこの URL で読取専用カタログ照会 | 同上 |
| Preview | 接続用 `DATABASE_URL` | （実行時の接続先は未検証） | | ユーザー確認: 開発 DB の接続文字列で登録した | 保存値・実行時の接続先は未検証 |
| Preview | migration 用 `DATABASE_URL_UNPOOLED` | （実行時の接続先は未検証） | | 同上 | 同上。ブランチ上書きの保存値も未検証 |

### 5.1 開発 DB 適用前調査（読取専用・実施済み）

- 失敗・未完了の `_prisma_migrations` 行: なし（139 件すべて `finished_at` あり、`rolled_back_at` なし）
- ローカル（hotfix）141 本、DB 139 本。差は今回の 2 本のみ。DB にだけある migration はなし
- DB の最終適用: `20260623120000_event_allowed_age_category_ids`
- 未適用（ローカルのみ）:
  - `20261015120000_qualification_history_confirmation_invalidated`
  - `20261015120100_qualification_confirmation_columns`
- 確認カラム / `CONFIRMATION_INVALIDATED` / `Qualification_confirmedAt_idx`: **いずれも未作成**
- checksum: 適用後 141 件すべて hotfix の対応 `migration.sql` と一致。不一致なし。ローカルファイル欠落なし
- 正式 migration 2 本を開発 DB（`bluvium-development` / `lnxzbwdhibaavqfclkgx` / `postgres`）へ順に `migrate deploy` 済み。レビュー SQL は未実行
  - `20261015120000_qualification_history_confirmation_invalidated`（140 件目）
  - `20261015120100_qualification_confirmation_columns`（141 件目）

### 5.2 Preview

開発 DB の接続文字列で登録したとユーザー確認済み。保存値・実行時の接続先は未検証。Preview 実行環境へは接続していない。

## 6. ユーザーがダッシュボードで見る画面と項目

接続 URI 全文・パスワードは見えても書き出さない。記録するのは識別子・名称・ブランチ・DB 名だけ。

### Supabase（ローカル識別子との照合）

1. [Supabase Dashboard](https://supabase.com/dashboard) にサインインする
2. プロジェクト一覧で Reference ID が `lnxzbwdhibaavqfclkgx` の行を開く（または URL `/project/lnxzbwdhibaavqfclkgx`）
3. **Project Settings → General**
   - **Name**（プロジェクト名称）
   - **Reference ID**（`lnxzbwdhibaavqfclkgx` と一致するか）
4. **Project Settings → General** または **Branches**（左ナビの Branches）
   - 既定ブランチ名
   - persistent / preview ブランチの有無（名前だけ）
5. Database の Connect 画面を開く場合は、ホストに含まれる Reference ID と DB 名だけ見る。URI・パスワードはコピーしない

名称が「dev」「staging」等でも、それだけで開発専用とはしない。ダッシュボードの Name を確認表の「根拠」に書き、用途は別途判断する。

### Vercel Preview（本番変数を開かない）

1. [Vercel Dashboard](https://vercel.com/dashboard) で、このリポジトリを Git 連携しているプロジェクトを開く
2. **Settings → Environment Variables**
3. フィルタを **Preview** だけにする。**Production は開かない・コピーしない**
4. `DATABASE_URL` と `DATABASE_URL_UNPOOLED` の各行で確認する項目:
   - Environment が Preview か
   - **Git Branch** 列（空 = Preview 全体、ブランチ名あり = そのブランチの上書き）
   - 値を表示する場合はホスト内のプロジェクト識別子とパスの DB 名だけメモする
5. Production や「All Environments」の一括エクスポートは使わない

hotfix worktree（`bluvium-security-hotfix`）には `.env` が無い。ローカル照合の対象ファイルは `bluvium-development/.env` である。

