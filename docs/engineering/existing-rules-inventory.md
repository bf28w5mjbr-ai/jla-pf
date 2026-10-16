# 既存ルール調査・最終レビューメモ

最終更新: 2026-10-16（DEV-33〜35 最終レビュー後）

## 存在したもの

| パス | 内容 | 扱い |
|------|------|------|
| `AGENTS.md`（本 tree・整備後） | 体制・承認・Ruleset 要約 | **正本（共通）** |
| PR #42 `AGENTS.md` | Cursor Cloud 手順のみ | **`docs/engineering/cursor-cloud.md` へ分離**。PR #42 は supersede |
| `.cursor/rules/` | 4 ファイル `alwaysApply: true` | 共通制約のみ。Cloud 手順は置かない |
| `docs/architecture/bluvium-principles.md` | 設計思想 | 尊重・リンク |
| `docs/BRANCH_PROTECTION.md` | `main`・auto-merge 許可と記載 | **残存矛盾**（別 Task で実態更新） |
| `docs/AUTOMATION.md` | CI / auto-merge / deploy | base の `auto-merge.yml` は label 起動のまま残存しうる。方針はラベル不使用 |
| `docs/SECURITY_SCANNING.md` | audit 記述が CI 実態と差 | SEC-01 で扱う |
| GitHub Issues | 0 件 | 論理 Task ID 運用 |

## PR #42 統合方法（確定）

1. ガバナンス PR を **default / production branch** 向けに先に入れる（`AGENTS.md` = 体制）
2. Cloud 手順は `docs/engineering/cursor-cloud.md`
3. PR #42 はクローズ、または「AGENTS.md 削除 + cloud 文書へのポインタのみ」に更新してから閉じる
4. **PR #42 を先に Merge しない**（`AGENTS.md` 全体が Cloud 文面で上書きされる）

## alwaysApply の適用範囲

| ファイル | alwaysApply | 妥当性 |
|----------|-------------|--------|
| `bluvium-core.mdc` | true | 製品・役割・自律の最小セット |
| `approval-gates.mdc` | true | 承認境界は常時必要 |
| `git-worktree-safety.mdc` | true | dirty 保護は常時必要 |
| `cursor-reporting.mdc` | true | 「substantive updates」に限定する旨を本文で明記 |

Cloud 手順は `alwaysApply` にしない（ファイル自体を rules に置かない）。

## Worktree（調査時点）

| パス | ブランチ | 備考 |
|------|----------|------|
| `bluvium-development` | production default | ガバナンス + 他 dirty が混在 → **PR 分離必須** |
| `bluvium-public-qualification-hotfix-ci` | PR #44 | 機能リリース。ガバナンスと非依存 |
| `bluvium-dev18-preview-email` | PR #45 | base が #44。ガバナンスと非依存 |

## Ruleset 実態（再確認）

- `Protect Production Branch` → `fix/login-localize-and-session-helper`
- PR 必須、review count 0、status checks なし、non_fast_forward、deletion 禁止
- プロセス上の PO 承認・Deploy 分離は文書で上乗せ

## PR #44 / #45 依存

| PR | 関係 |
|----|------|
| #44 | コード・migrate リリース。ガバナンス文書と **ファイル依存なし** |
| #45 | #44 上の Preview メール。同様に非依存 |
| ガバナンス | **#44/#45 を待たず** default branch へ単独 PR 可能 |

注意: 同一 worktree の未コミット資格/email 変更をガバナンス PR に混ぜない。
