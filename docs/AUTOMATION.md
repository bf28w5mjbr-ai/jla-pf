# GitHub Automation Guide

## Workflows

### CI (`.github/workflows/ci.yml`)
- Runs on every push and PR
- Steps: Install deps, Typecheck, Lint, Build
- Required for PR merge

### CodeQL (`.github/workflows/codeql-analysis.yml`)
- Security scanning on every push/PR
- Required for PR merge

### Labeler (`.github/workflows/labeler.yml`)
- Automatically applies labels based on file paths
- No blocking

### Stale Issues/PRs (`.github/workflows/stale.yml`)
- Marks issues/PRs stale after 60 days
- Closes after 7 more days
- Runs weekly

### Dependabot Auto-Approve & Merge (`.github/workflows/auto-approve-dependabot.yml`)
- Auto-approves Dependabot PRs
- Auto-merges with squash method
- Only for dependency updates

### Auto-Merge (`.github/workflows/auto-merge.yml`)
- Merges PRs labeled `automerge` or `dependencies`
- Requires passing CI
- Uses squash merge

## Configuration Files

- `.github/CODEOWNERS` - Code ownership rules
- `.github/dependabot.yml` - Dependency update scheduling
- `.github/labeler.yml` - Auto-labeling rules
- `.github/PULL_REQUEST_TEMPLATE.md` - PR template
- `.github/ISSUE_TEMPLATE/` - Issue templates

## Manual Operations

### Update Branch Protection
```bash
bash scripts/setup-branch-protection.sh
```

### List Branch Protection Rules
```bash
gh api repos/bf28w5mjbr-ai/jla-pf/branches/fix/login-localize-and-session-helper/protection
```

### Remove Branch Protection
```bash
gh api repos/bf28w5mjbr-ai/jla-pf/branches/fix/login-localize-and-session-helper/protection -X DELETE
```
