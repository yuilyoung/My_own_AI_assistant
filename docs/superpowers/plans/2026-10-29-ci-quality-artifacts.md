# CI quality gates and installable artifacts implementation plan

> For agentic workers: use superpowers:executing-plans task by task.

**Goal:** Reject formatting, lint, type, security and test regressions, build installable packages, verify installation outside the checkout, and retain downloadable artifacts.
**Architecture:** GitHub Actions quality gate -> OS/Python test matrix -> package build -> clean-environment install matrix -> distributable artifacts. A version tag can create a draft release only after all gates pass; no server deployment or automatic update.
**Tech Stack:** Ruff, mypy, Bandit, ESLint, Prettier, pytest/coverage, Node test runner, setuptools/build/twine, GitHub Actions.
**Spec:** docs/design/technical-design.md and the approved CI/CD scope in this conversation.

## Global constraints
- Python 3.11 and 3.13, Windows and Ubuntu, Node 22.
- No models, proprietary Live2D assets, recordings, access tokens or user databases in CI/artifacts.
- Demo providers only; no paid API keys, microphones, or actual ML inference in CI.
- CI checks do not modify source. Quality failures must block publishable artifacts.
- Work on feat/ci-quality-artifacts; main is preserved pending review.

## Review focus
- Package UI must work outside the source checkout (regression test + installed HTTP smoke).
- Failed/cancelled test jobs must not be mistaken for release success (explicit success gate).
- Artifacts must not sweep up local secrets (allowlist and archive-content test).
- Shell failure and failed report uploads must not mask the original test failure.
- Releases must match the package version and a commit on main; create drafts, not deployments.

## Task 1: Quality tools and reproducible tool configuration
Files: requirements-ci.txt, package.json, package-lock.json, eslint.config.mjs, .prettierrc.json, pyproject.toml.
- [ ] Pin direct quality tools; generate and commit npm lockfile.
- [ ] Format existing Python/web code once; subsequent CI runs check only.
- [ ] Run Ruff format/check, mypy on gateway, Bandit on runtime code, ESLint and Prettier.
- [ ] Fix reported issues without weakening checks or altering app behavior; rerun existing tests.
- [ ] Commit quality configuration and canonical formatting.

## Task 2: Installable web resources and regression tests
Files: apps/diagnostics/__init__.py, services/gateway/config.py, pyproject.toml, services/gateway/tests/test_distribution.py.
- [ ] Add failing test for default UI lookup after changing working directory.
- [ ] Package diagnostic resources as gateway_ui; resolve packaged resources first and source resources only when running source.
- [ ] Run all Python and Node tests.
- [ ] Build wheel/sdist and inspect archive contents; ensure tests and private assets are excluded.
- [ ] Commit packaging fix.

## Task 3: Verification and release bundle
Files: scripts/smoke_installed.py, scripts/package_release.py, tests for bundle contents/version/checksums.
Interfaces: smoke_installed.py --python <venv python>; package_release.py --dist dist [--tag vX.Y.Z].
- [ ] Write failing tests for allowlisted runtime ZIP, checksum integrity, missing packages and mismatched tags.
- [ ] Implement bounded HTTP smoke from a temporary directory using installed package and demo providers only.
- [ ] Build runtime ZIP from an explicit allowlist, plus manifest and SHA256SUMS.
- [ ] Run unit tests and real installed HTTP smoke.
- [ ] Commit scripts and tests.

## Task 4: Workflow and documentation
Files: .github/workflows/tests.yml, docs/ci-cd.md, README.md, .github/dependabot.yml.
- [ ] Quality -> matrix tests with reports -> build -> clean install matrix -> distribution upload.
- [ ] Preserve failure diagnostics with always() report uploads; expire reports and distribution artifacts.
- [ ] Restrict write permissions to a tag-only draft-release job; verify version and main ancestry.
- [ ] Document local commands, exact artifacts, exclusions, and branch protection not configured.
- [ ] Push feature commits, run GitHub Actions, inspect logs/artifact metadata, and open PR.

## Environment note
The local execution container cannot resolve package registries. A temporary branch-only preparation workflow will install pinned formatters, generate the npm lockfile, apply canonical formatting, and commit only those tracked changes. It removes itself in that same commit. This is a one-time migration, not the final checking workflow. No secrets or model downloads are involved.
