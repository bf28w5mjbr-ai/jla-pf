# Bluvium 開発ワークフロー

最終更新: 2026-10-16  
対象読者: Product Owner / ChatGPT / Cursor  
エージェント短縮版: リポジトリ直下 `AGENTS.md` と `.cursor/rules/`

## 1. 役割

| 役割 | 責務 | しないこと |
|------|------|------------|
| Product Owner | 事業判断、公開可否、本番操作の最終承認 | 日常の実装細部の指示を毎回繰り返す必要はない |
| ChatGPT | 計画、優先順位、設計レビュー、進捗管理、承認ゲートの整理 | 無断での本番操作指示の省略 |
| Cursor | 調査、実装、テスト、技術的自己解決、文書草案 | 承認ゲートの迂回 |

設計思想は [`../architecture/bluvium-principles.md`](../architecture/bluvium-principles.md) を参照。

## 2. 標準フロー

```text
Task Definition
  → Cursor Investigation
  → Implementation
  → Testing
  → Cursor Self-Review
  → ChatGPT Review
  → Approval Gate（必要な場合のみ）
  → GitHub 反映（Commit / Push / PR）
  → Completion
```

### 各段階の期待成果

| 段階 | 成果 |
|------|------|
| Task Definition | Task ID、目的、完了条件、承認境界が Issue または依頼文にある |
| Investigation | 影響範囲・既存実装・矛盾する文書の要約 |
| Implementation | 割当 worktree での最小差分 |
| Testing | 関連する typecheck / lint / test の実行結果 |
| Self-Review | 報告テンプレ（Risks / Approval Required を含む） |
| ChatGPT Review | 優先度・設計・公開リスクの確認 |
| Approval Gate | PO または明示承認者の OK（本番・Git 反映など） |
| GitHub 反映 | Conventional Commits + PR（重要変更は Draft 可） |
| Completion | Issue 更新、Next Action なしまたは後続 Task ID |

## 3. 自律と停止

### Cursor が自律継続してよい

- コンパイルエラー、テスト失敗、明らかなロジック欠陥の修正と再実行
- ローカルでの設計選択（既存パターン踏襲）
- ドキュメント草案の追加・改訂（タスク範囲内）

### 停止して報告する

- 承認ゲートに該当する操作が必要になったとき
- 既存 dirty worktree を壊さないと進めないとき
- ストレージ不足・検証環境を安全に確保できないとき
- 仕様が矛盾し、事業判断が必要なとき
- 秘密情報なしでは検証不能なとき

## 4. 承認ゲート（境界）

詳細は `.cursor/rules/approval-gates.mdc`。要約:

**要承認:** Commit/Push/PR、**Production DB** 接続（読取含む）・変更・migrate、**共有 Development DB** 接続（読取含む）・書込・migrate、**Production Merge**、**Production Deploy**、本番 env、秘密情報、データ削除、USB バックアップ変更、範囲外のホスト変更。

**通常不要:** 割当 worktree での実装、読取専用の `gh` 調査、草案ドキュメント、承認済みタスク範囲内の **完全に独立した使い捨てローカル DB** の利用。

承認は「操作単位」。一度の承認で翌日の別操作まで拡大しない。DB 接続情報は報告に出さない。

### Production Merge と Production Deploy

- Merge 承認と Deploy 承認は **別々に**管理する。
- Production ブランチへの Merge が Production Deploy を **自動起動する構成**では、Merge 前に Deploy 承認も取得する。**Deploy 承認が無い場合は Merge しない。**
- 自動 Deploy が Merge と不可分な場合も、**両方の承認を得てから** Merge する。
- Vercel 等の自動 Deploy 設定変更は、別途明示承認がない限り行わない。

### GitHub Ruleset との関係（2026-10-16 確認）

| 項目 | 実態 |
|------|------|
| Ruleset | `Protect Production Branch`（active） |
| 対象 ref | `refs/heads/fix/login-localize-and-session-helper` |
| 強制 | ブランチ削除禁止、non-fast-forward、**PR 必須** |
| 必須レビュー数 | **0**（GitHub 上はレビューなしでも Merge 可能） |
| 必須 status checks | **なし**（`dependency-scan` 失敗でも Ruleset だけでは Merge を止めない） |
| `allow_auto_merge` | **false** |

プロセス要件（PO 承認・Deploy 分離）は Ruleset より厳しい。Ruleset を満たしただけでは Production 操作してよいことにならない。

古い `docs/BRANCH_PROTECTION.md`（`main` / Allow auto-merge）は未更新。操作前は `gh api repos/.../rulesets` で確認する。

## 5. Git / Worktree 運用

- 作業前に `git worktree list` と当該 tree の `git status` を確認
- 他 tree の未コミット変更を reset/stash しない
- 新規 worktree はディスク空きを確認してから（逼迫時は agent store に草案）
- Force push 禁止。`automerge` ラベル禁止（base に旧 workflow が残っていても使わない）
- 本番ブランチへの Merge と Production Deploy はそれぞれ個別承認（自動 Deploy 連動時は §4 の両方承認ルール）
- ガバナンス文書と機能変更が同じ dirty tree にある場合、**PR を分離**する

## 6. 品質ゲート（ローカル）

タスクに応じて最小限を実行する。

```bash
pnpm lint
pnpm test --run
# 必要なら
pnpm exec tsc --noEmit
pnpm build   # AUTH_SECRET 等が必要な場合あり
```

セキュリティスキャナの閾値緩和は承認事項（公開判断資料の方針を維持）。

## 7. デプロイとの関係

- Vercel Preview は PR 連携で動きうる（自動）。Production Deploy は別承認。
- Production ブランチ Merge が Production Deploy を自動起動する場合は §4（Merge 前に Deploy 承認必須）。
- GitHub `deploy-canary.yml` は主に `main` / `workflow_dispatch`（default branch 名と一致しない場合がある）
- **migrate と Production Deploy の順序**はリリース Task（例: DEV-19 / REL-01）で明示する

関連: `docs/DEPLOYMENT.md`、`docs/B-007-connection-target-checklist.md`（存在する場合）

## 8. 文書の置き場

| 種類 | 場所 |
|------|------|
| エージェント常時制約 | `.cursor/rules/*.mdc`（`alwaysApply: true`・短文） |
| エージェント入口（共通） | `AGENTS.md`（Cloud 手順は含めない） |
| Cloud VM 手順 | `docs/engineering/cursor-cloud.md` |
| 人間・ChatGPT 向け運用 | `docs/engineering/*` |
| ドメイン設計 | `docs/architecture/*` |
| 機能・運用マニュアル | `docs/*.md` |
