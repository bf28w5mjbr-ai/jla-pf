# Bluvium — Agent 指針

Cursor / 自動化エージェント向けの入口。人間向けの運用詳細は `docs/engineering/` を正とする。

Cloud VM 固有の起動・接続メモは **このファイルに書かない**。  
→ [`docs/engineering/cursor-cloud.md`](docs/engineering/cursor-cloud.md)  
（旧 PR #42 の Cloud 専用 `AGENTS.md` は本体制と衝突するため、取り込み時は本ファイルを正とし Cloud 内容を上記へ移す。）

## 製品方針

Bluvium は JLA 専用システムではない。複数競技に対応するスポーツ基盤。

**One Person, Multiple Roles, Connected Sports.**

設計原則の詳細: [`docs/architecture/bluvium-principles.md`](docs/architecture/bluvium-principles.md)

## 役割分担

| 役割 | 責務 |
|------|------|
| Product Owner | 事業判断・重要事項の承認 |
| ChatGPT | 開発計画・優先順位・設計レビュー・進捗管理 |
| Cursor | 技術調査・実装・テスト・問題解決（許可範囲内で自律） |

## 自律実行してよいこと

コード調査、技術設計、ローカル実装、型チェック / Lint / テスト、エラー分析と再検証、ドキュメント草案。

技術的な問題は可能な範囲で自己解決し、承認ゲートに当たるまで停止しない。

### データベース

| 対象 | 接続・読取 | 書込・migrate |
|------|------------|---------------|
| Production DB | **明示承認必須** | **明示承認必須** |
| 共有 Development DB | **明示承認必須** | **明示承認必須** |
| 完全に独立した使い捨てローカル DB | 承認済みタスクの範囲で利用可 | 同左 |

DB 接続情報・パスフレーズ等の秘密情報を報告やログに出力しない。

## 事前承認が必要なこと（必須）

操作ごとに事前承認が必要。チャット過去の承認は範囲を拡大しない。

| 操作 | 注記 |
|------|------|
| Commit / Push / PR 作成・更新 | GitHub 反映は都度承認 |
| Production DB 接続・読取・書込・migrate・本番への restore | 読取も承認対象 |
| 共有 Development DB 接続・読取・書込・migrate | 読取も承認対象。タスクで明示されたときのみ |
| Production ブランチへの Merge | GitHub Ruleset を満たしても **PO 承認は別途必須** |
| Production Deploy / 本番 env 変更 | Merge 承認と Deploy 承認は **別管理** |
| 秘密情報の取得・使用・表示 | パスフレーズ・接続文字列をチャットに出さない |
| 既存業務データの削除 | — |
| USB バックアップの変更・削除 | — |
| 承認範囲外のホスト変更 | 永続 PATH、既存 PGDATA、無関係なパッケージ更新など |

### Production Merge と Production Deploy

- Merge 承認と Deploy 承認は通常 **別々に**管理する。
- **Production ブランチへの Merge によって Production Deploy が自動起動する構成では、Merge 実行前に Deploy についても承認を取得する。Deploy 承認がない場合は Merge しない。**
- 自動 Deploy が Merge と不可分に連動する場合も、**両方の承認を取得してから** Merge する。
- Vercel 等の自動 Deploy 設定自体の変更は、別途明示承認がない限り行わない。

## Git / Worktree

- 既存の未コミット変更を保護する（無断 reset / stash 禁止）
- Force Push 禁止（方針）。本番ブランチは Ruleset `non_fast_forward` でも禁止
- **`automerge` ラベルを付けない**。リポジトリの `allow_auto_merge` は false。base 上に旧 auto-merge workflow が残っていても使わない
- Production 操作（Merge / Deploy / 本番 DB）は都度個別承認
- 重要な変更は原則 PR（Ruleset は PR を要求）

## 標準ワークフロー

Task Definition → Investigation → Implementation → Testing → Cursor Self-Review → ChatGPT Review → Approval Gate（必要時） → GitHub 反映 → Completion

詳細: [`docs/engineering/development-workflow.md`](docs/engineering/development-workflow.md)

## 報告形式

[`docs/engineering/cursor-report-template.md`](docs/engineering/cursor-report-template.md)

```
Task ID:
Status:
Summary:
Changes:
Tests:
Risks:
Artifacts:
Next Action:
Approval Required:
```

## タスク管理

GitHub Issues 中心。分類プレフィックス: `DEV` / `SEC` / `PRD` / `OPS` / `REL`。  
詳細: [`docs/engineering/task-management.md`](docs/engineering/task-management.md)

## GitHub Ruleset（実態メモ）

- 名称: `Protect Production Branch`（active）
- 対象: `refs/heads/fix/login-localize-and-session-helper`（default branch）
- 内容: 削除禁止、non-fast-forward、**PR 必須**（required approving review count は 0、必須 status check なし）
- 解釈: GitHub 上はレビュー 0 でも Merge 可能な設定。**プロセス上は PO 承認なしで Production Merge / Deploy しない**

古い `docs/BRANCH_PROTECTION.md`（`main` / auto-merge 許可）とは差分あり。操作前は `gh` で Ruleset を確認する。

## 関連（人間向け）

| 文書 | 用途 |
|------|------|
| `docs/engineering/development-workflow.md` | 開発フロー |
| `docs/engineering/task-management.md` | Issue 運用 |
| `docs/engineering/cursor-report-template.md` | 報告テンプレ |
| `docs/engineering/cursor-cloud.md` | Cloud VM 手順（共通ルールではない） |
| `docs/SECURITY_SCANNING.md` | セキュリティスキャン |
| `docs/DEPLOYMENT.md` | デプロイ環境 |

ルールの機械適用: [`.cursor/rules/`](.cursor/rules/)
