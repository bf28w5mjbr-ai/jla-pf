# Branch Protection Rules

## Overview
This repository has branch protection rules enforced on the main development branch (`main`).

## Rules
- **Require 1 review** before merging
- **Require passing status checks**:
	- `CI / build`
	- `CodeQL / Analyze`
- **Dismiss stale reviews** when new commits are pushed
- **Allow auto-merge** (squash merge)
- **Disallow force pushes** and deletions

## How to Enable/Update

Run the setup script:
```bash
bash scripts/setup-branch-protection.sh
```

Requirements:
- `gh` CLI installed and authenticated
- Admin access to the repository

## Manual Configuration (GitHub UI)

If needed, configure manually:
1. Go to Settings → Branches → Branch protection rules
2. Select the branch
3. Apply the settings as described above
