# B-006 / B-018 ローカル実装（CI 修復。Hotfix とは別管理）

作業場所: `bluvium-ci-typecheck`（`fix/ci-typecheck-existing-errors`）。資格 Hotfix worktree は変更しない（結合テストの未使用変数整理のみ Hotfix 側）。Commit／Push／PR／Deploy なし。本番・Preview・共有開発 DB は未使用。永続 `.env` は未変更。

既存の CI 型修正 3 ファイル（`startListSnapshotReadHelpers.test.ts` / `teamMemberSlots.test.ts` / `technicalOfficialQueries.test.ts`）は上書きしていない。

## B-006 Lint

全体 `pnpm lint`: **0 error**（警告は残置。全解消は対象外）。機能変更・ルール無効化・一括警告抑制はしていない。

主な修正:

- `no-restricted-syntax`（Link/`a` の禁止 className）: `Button asChild` に className を移した
- `react-hooks/set-state-in-effect`: Passkey 対応は `useSyncExternalStore`。当日運用 unlock も同 API。ヒート展開は controlled / uncontrolled に分離。公開スケジュールのフォールバック effect は既存 `resolved*` に任せて削除
- レンダー中の ref 代入: polling の refreshRef を effect へ
- `prefer-const`

回帰: `useDayOpsUnlockEffective.test.ts`（新規）、`marshalRoundSettingsLock`、`competitionScheduleTabDisplay`、既存型修正 3 ファイル、`entryCheckoutStripeRefund.test.ts`。

## B-018 CI build 用 DB

`.github/workflows/ci.yml` に job 内 `postgres:16` を追加。認証は CI 専用ダミー `ci`/`ci` / `bluvium_ci` のみ。`DATABASE_URL` と `DATABASE_URL_UNPOOLED` に同一 URL を渡し、依存導入後に `prisma migrate deploy`、その後既存の typecheck / lint / test / build。

## 自己レビュー（Hooks / 展開 / ref）

| 箇所 | 変更前後 | 点検 | テスト |
| --- | --- | --- | --- |
| Passkey `useSyncExternalStore` | 以前は `useState(true)` + effect。SSR 初期値 true は維持。subscribe は空（値はページ寿命で不変） | 解除は no-op。クライアントは hydrate 後に `PublicKeyCredential` を読む | 追加なし |
| Unlock hook | 以前は `useState(false)` + effect。`getServerSnapshot` は false。購読は `storage`（同一タブの sessionStorage では発火しない。再レンダー時の getSnapshot は以前の effect 依存更新と同型） | unmount で removeEventListener。大会 ID 切替でヒントが混線しない | 購読解除・ID 隔離を追加 |
| ヒート開閉 | 以前は effect で `forceHeatExpanded` をローカルへ同期。一括開閉のあと行クリックで親が `undefined` に戻す | 初版の「controlled 中はローカルを更新しない」は一括指定解除後に isDirty へ戻る回帰。render 中に force を uncontrolled へ写し、クリックは表示中の値を反転 | 一括指定中・解除後・クリック後を追加 |
| polling `refreshRef` | 以前はレンダー中代入。いまは `useRef(初期関数)` + 依存なし effect | 同一コミットでは ref 同期 effect が draft pull より先。ポーリング間隔に対する遅れは実害なし | 追加なし |
| 公開スケジュール | 表示は元から `resolvedDayKey` / `resolvedAreaTabId`。effect は state へ同じフォールバックを書いていただけ | 表示とタブ value は変わらない | 既存 `competitionScheduleTabDisplay` |

## B-018 YAML 依存（レビュー。実行は未検証）

1. `services.postgres` の healthcheck（`pg_isready`）が green になるまで job step は始まらない想定  
2. `pnpm install --frozen-lockfile` の `postinstall` が `prisma generate`（明示ステップは無い。`--ignore-scripts` は使っていない）  
3. job env のダミー `DATABASE_URL` / `DATABASE_URL_UNPOOLED`（同一 URL）で `prisma migrate deploy`  
4. その後 typecheck / lint / test / `pnpm build`  

seed ステップは無い。空 DB での migrate・build は実行系が無く **未検証のまま**。GitHub CI 成功は未主張。

## ローカル検証（使い捨て DB）

このマシンに Docker / Postgres 実行系が無く、空 DB への全 migration と seed なし `pnpm build` は **未検証**。GitHub 上の CI 成功は未確認・未主張。インストールや共有開発 DB への切替はしていない。

## Hotfix との組合せ

一時コピー（秘密ファイル・`.env*`・`b003-ui-local-ops.mjs` 除外）。型修正 3 ファイルは両 worktree で **バイト一致**のため上書きせず CI 側を保持。競合ファイルは無し。

統合コピーでの結果: Lint error 0、型チェック成功（結合テストの describe オプションと audit mock の型だけ Hotfix 側で最小修正）、通常テスト 1102 成功 / 結合・E2E 等 11 skip。migrate / build は未実施。
