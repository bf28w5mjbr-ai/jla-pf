# Bluvium タスク管理（GitHub Issues 中心）

最終更新: 2026-10-16  
**今回の整備時点では Issues の新規作成・更新は行わない。** 本文書は運用ルールと導入手順。

## 1. 方針

- 作業の正本は **GitHub Issues**（将来）。チャット上の Task ID は Issue タイトルまたは本文の ID と対応させる。
- 2026-10-16 時点: リポジトリの open/closed Issues は **0 件**（`gh issue list`）。既存の `DEV-19` / `DEV-20` 等は会話・文書上の ID。重複 Issue を作る前に検索すること。
- PR は Issue を閉じる単位。1 Issue : 1 主 PR を推奨（付帯 PR は本文でリンク）。

## 2. 分類プレフィックス

| プレフィックス | 意味 | 例 |
|----------------|------|-----|
| `DEV` | 開発基盤・CI・バックアップ・ツール | DEV-20 |
| `SEC` | セキュリティ・依存脆弱性・権限 | SEC-01 |
| `PRD` | プロダクト機能 | PRD-xx |
| `OPS` | サービス運営・運用手順 | OPS-xx |
| `REL` | 本番リリース判断・公開手順 | REL-01 |

ラベル（GitHub）は既存の `bug` / `enhancement` / `documentation` / `deps` / `frontend` 等を併用する。  
将来追加候補（未作成）: `dev`, `sec`, `prd`, `ops`, `rel`, `needs-approval`, `blocked`。

## 3. Issue が持つべき項目

タイトル例: `[DEV-20] 本番 public バックアップと L4 復元`

本文必須フィールド:

| フィールド | 内容 |
|------------|------|
| Task ID | `DEV-20` など |
| 目的 | なぜやるか |
| 優先度 | P0 / P1 / P2 |
| 現在の状態 | `triage` / `ready` / `in_progress` / `blocked` / `needs_approval` / `done` |
| 担当 | `cursor` / `chatgpt` / `po` / 人名 |
| 完了条件 | 検証可能な Done の定義 |
| 関連 PR | URL または番号 |
| 検証結果 | コマンド結果の要約（秘密なし） |
| 承認状況 | 不要 / 待ち / 取得済み（何を誰が） |
| 次のアクション | 一文 |

雛形: [`issue-body-template.md`](./issue-body-template.md)

## 4. 状態遷移

```text
triage → ready → in_progress → (blocked | needs_approval) → in_progress → done
```

- `blocked`: 環境・依存・他 Task 待ち
- `needs_approval`: 承認ゲート（本番・Git 反映など）
- ChatGPT が優先順位を付け、Cursor が `in_progress` で実装する

## 5. PR との関係

- 重要変更は Draft PR から開始してよい
- PR 本文に `Task ID` と完了条件への参照を書く
- auto-merge ラベル運用は現状無効化されているワークフローがあるため、**手動 Merge + 個別承認**を既定とする
- Production Merge / Deploy は REL タスクで追跡

## 6. 既存 ID との対応（スナップショット）

Issue 未作成のため、以下は管理上の論理タスク（2026-10-16）。GitHub 反映時に Issue 化する。

| Task ID | 状態 | 要約 |
|---------|------|------|
| DEV-20 Track A | done | PG17.11 本番 public 暗号化バックアップ + ローカル L4 復元成功 |
| DEV-20 Track B | ready/未着手 | Auth/Storage 含む全体 DR |
| DEV-19 | needs_approval 手前 | PR #44 migrate/公開手順の分析済み。本番 migrate 未実行 |
| DEV-33〜35 | local done | 開発体制ルール整備・最終レビュー。GitHub 未反映 |
| REL-01 | needs_approval | PR #44 本番公開未承認 |
| SEC-01 | ready | 残存依存関係の到達性・受容判断の継続 |
| （PR #42） | Draft → supersede 予定 | Cloud 専用 AGENTS.md。`cursor-cloud.md` へ移管 |
| （PR #44） | Draft | 資格 API セキュリティ + CI。Merge/Deploy 未 |
| （PR #45） | Draft | Preview メール。REL-01 と分離 |

## 7. 重複回避

Issue 作成前:

```bash
gh issue list --search "DEV-20" --state all
gh issue list --search "backup OR qualification" --state all
```

チャットだけで進めた Task は、Issue 化時に Artifacts（手順書・canvas・agent store）を貼る。

## 8. ChatGPT / Cursor の使い分け

| 行為 | 主担当 |
|------|--------|
| バックログ優先順位 | ChatGPT + PO |
| 技術調査・実装・テスト | Cursor |
| 設計レビュー・公開リスク整理 | ChatGPT |
| 本番操作の承認 | PO |
| Issue 本文の状態更新（承認後の Git 操作時） | Cursor または人間 |

## 9. 導入手順（承認後）

1. **ガバナンスのみ**を default branch（`fix/login-localize-and-session-helper`）向け PR にする。PR #44/#45 に積み上げない
2. 含めるパス: `AGENTS.md`、`.cursor/rules/`、`docs/engineering/`、`README.md` の導線変更のみ（他 dirty を混ぜない）
3. Merge 後、PR #42 を supersede（クローズまたは Cloud 文書ポインタのみへ縮小）
4. （任意）ラベル `dev`/`sec`/`prd`/`ops`/`rel` と Issue テンプレ追加
5. 論理タスクを必要分だけ Issue 化
6. （別 Task）`docs/BRANCH_PROTECTION.md` / `docs/AUTOMATION.md` を Ruleset 実態に合わせて更新
