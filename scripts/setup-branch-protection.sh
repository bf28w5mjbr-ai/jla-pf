#!/bin/bash
# Configure branch protection for the main development branch
# Run this script to apply protection rules

REPO="bf28w5mjbr-ai/jla-pf"
BRANCH="fix/login-localize-and-session-helper"

echo "Configuring branch protection for ${REPO}/${BRANCH}..."

gh api repos/${REPO}/branches/${BRANCH}/protection \
  -X PUT \
  -f required_status_checks='{
    "strict": true,
    "contexts": [
      "CI / build (pull_request)",
      "codeql"
    ]
  }' \
  -f required_pull_request_reviews='{
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 1
  }' \
  -f enforce_admins=false \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f required_linear_history=false \
  -f allow_auto_merge=true

echo "✅ Branch protection configured successfully"
