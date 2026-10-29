# CI/CD: quality checks and verified local-runtime artifacts

## Scope

This pipeline validates the existing FastAPI gateway and diagnostic web UI. React/Live2D rendering, real microphones, model inference, device latency and production server deployment are NOT certified by these checks.

The final workflow is `.github/workflows/tests.yml`. It never auto-formats or commits application code. Initial formatting/lockfile generation was a controlled migration on the feature branch; the temporary preparation workflows remove themselves and are not part of the final CI.

## Pipeline

`quality -> test matrix -> build -> installed-runtime matrix -> distribution -> CI gate`

| Stage | Checks |
|---|---|
| Python quality | `ruff format --check`, `ruff check` (including imports), mypy with untyped function-body checking |
| Python security | Bandit over gateway and optional Melo worker; medium/high severity findings fail the job; tests excluded |
| Web quality | Prettier check and ESLint recommended rules, zero warnings |
| Tests | Python 3.11/3.13 x Ubuntu/Windows; pytest + branch coverage minimum 85%; Node 22 tests |
| Build | Python sdist then wheel from sdist; strict Twine metadata validation; allowlisted runtime ZIP |
| Installed smoke | Extract the ZIP, run `install.ps1` or `install.sh`, install into a clean venv, `pip check`, start the installed server in a temporary folder with isolated Python imports |
| HTTP checks | Authentication, packaged HTML/JS/CSS/worklet, demo conversation, memory separation, companion tool denial, STT disabled |
| Final gate | Fails if any prerequisite failed, was cancelled, or was skipped |

Python type checks currently cover `services/gateway` and do not claim strict typing of every function. The optional heavyweight Melo/ML dependency environment is not installed in CI. Bandit is source-security analysis, not a CVE/dependency-vulnerability scan. The plain JavaScript diagnostic UI is linted; there is no TypeScript/React production build yet. Node coverage applies to modules exercised by tests, not an end-to-end browser test.

## Artifacts

From Actions -> the workflow run -> Artifacts:

| Name | Contents | Retention |
|---|---|---|
| `quality-report` | Bandit JSON (when that check was reached) | 14 days |
| `tests-<os>-py<version>` | Python/JS JUnit, Python coverage XML/HTML, JS LCOV | 14 days |
| `install-<os>-py<version>` | Installed HTTP smoke JSON | 14 days |
| `candidate-<sha>` | Intermediate package used for install testing; NOT release approval | 1 day |
| `distribution-<sha>` | Verified wheel, source tarball, runtime ZIP, manifest, SHA256SUMS | 30 days |

Test-report uploads use `always()`: failure diagnostics are retained without treating a failed test as success. Setup failures may occur before report files exist; the original job still fails. A candidate can exist when installation fails; the final `distribution` artifact cannot.

The runtime ZIP is a Python installation bundle, not an `.exe` or an offline installer. It contains the wheel, pinned direct runtime constraints, installation/start scripts, and instructions. Python 3.11+ and internet access for dependency installation are required. Never include API keys, `.env`, `.local-data`, SQLite databases, recordings, models or proprietary Live2D assets. Files are selected by allowlist, not by zipping the working directory.

`manifest.json` records the tested Git SHA, package version, file sizes and SHA-256 hashes. `SHA256SUMS.txt` also covers the manifest. Checksums detect corruption; they are not a signing/provenance guarantee. A PR run's SHA is GitHub's tested merge commit, not necessarily the source branch head.

## Local checks

```sh
python -m pip install -r requirements-ci.txt
npm ci --ignore-scripts
python -m ruff format --check .
python -m ruff check .
python -m mypy
python -m bandit -r services/gateway workers -x services/gateway/tests -ll
npm run format:check
npm run lint
python -m pytest --cov=gateway --cov-branch
npm test
python -m build
python -m twine check --strict dist/*
python scripts/package_release.py
python scripts/package_release.py --verify
```

Run `python -m ruff format .` and `npm run format` locally to apply formatting. Commit the changes; CI itself only checks. `npm run test:ci` requires a `reports` directory, which the workflow creates.

Quality tool versions are pinned directly; the npm transitive graph is locked with integrity hashes. Python direct runtime versions are constrained, but the complete cross-platform Python transitive graph is not hash-locked. Do not call this a fully reproducible or hermetic build. Dependabot proposes weekly action/npm/pip updates after this configuration reaches the default branch; it does not auto-merge them.

## Draft release (delivery, not deployment)

After merging into main and deliberately pushing a version tag matching `pyproject.toml` (for example `v0.2.0`), the same full pipeline runs. Only after `CI gate` passes can the release job use `contents: write`. It verifies that the tagged commit is on main, the tag matches the package version, and checksums match. It attaches the already-tested artifacts to a **draft** GitHub Release. It does not rebuild them, publish the draft, deploy a server, or update a user PC.

No version tag or release is created by this implementation task. Rerunning an existing release tag will not silently overwrite an existing release. Publishing remains a human decision.

## Repository policy

Actions are pinned to verified commit SHAs. Ordinary jobs have `contents: read`, do not persist checkout credentials, and do not use `pull_request_target`. Only the tag-gated draft-release job has write access. Job timeouts and per-ref concurrency bound runaway work.

A failing check is not itself branch protection. Repository rulesets/required checks are NOT changed by this work. After merging, an administrator should configure `CI gate` as a required status check and require PRs. Main is not automatically merged by these workflows.
