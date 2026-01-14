# Security Scanning Configuration

## Overview

This repository has multi-layer security scanning enabled:

1. **Secret Scanning** - TruffleHog detects exposed credentials
2. **SAST (Static Analysis)** - ESLint security plugin checks for code vulnerabilities
3. **Dependency Scanning** - npm audit and Snyk check for vulnerable dependencies
4. **Docker Scanning** - Trivy scans container images for CVEs
5. **CodeQL** - GitHub's semantic code analysis for security patterns

## Setup

### Snyk Token

Add `SNYK_TOKEN` secret in GitHub repository settings:
1. Go to https://app.snyk.io/account/api-token
2. Copy your token
3. Add as `SNYK_TOKEN` in GitHub Secrets

### Severity Thresholds

- **Critical/High** - Blocks merge
- **Medium** - Warning only
- **Low** - Info only

## Running Locally

```bash
# Check for secrets
npm install -g trufflesecurity
trufflehog filesystem .

# Dependency audit
npm audit

# ESLint security
npm run lint -- --plugin security

# Docker scan (requires Trivy)
trivy image jla-pf:latest
```

## Response

If vulnerabilities found:
1. Check GitHub Security tab
2. Review SARIF report
3. Create security issue
4. Plan remediation
5. Test before merging
