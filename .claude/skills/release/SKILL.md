---
name: release
description: Propose a Step Tracker version bump and commit it on the current feature branch with the work, then confirm the automated Android release was published after merge. Use when asked to release/bump/ship, or when finishing a task on a branch that has unreleased changes.
---

# Release

`package.json`'s `version` is the only version (Gradle derives `versionName`/`versionCode` from it).
The bump is part of the work: it is committed on the feature branch and merged with the PR.
Merging it to `main` makes `.github/workflows/tag-release.yml` create the `vX.Y.Z` tag and dispatch
`.github/workflows/release-android.yml`, which builds the signed APK and publishes it as a GitHub
Release on `piyushbhargava1412/step-tracker`, where the app's Settings › App › Check finds it.
See `.context/flows/app-updates.md`. Never create or push tags by hand.

## 1. Propose the bump

1. `git fetch origin --tags`, then the latest tag: `git tag --list 'v*' --sort=-v:refname | head -1`.
2. Unreleased commits, including this branch's: `git log <tag>..HEAD --no-merges --pretty='%s'`.
3. If there are none, or `package.json` on this branch is already above the latest tag (the branch
   already carries a bump), say no further bump is needed and stop.
4. Suggest a level from the commit subjects: `feat` → minor; only `fix` / `chore` / `refactor` /
   `docs` / `test` → patch; a breaking change (`!` or "BREAKING") → major. Changes that never reach
   the app or the web viewer (docs, agent files, CI only) may not need a release: offer "No release"
   prominently then.
5. Ask with AskUserQuestion: the proposed version first (Recommended), the other levels, and
   "No release". Do not edit anything before they answer.

## 2. Commit the bump on the branch

On the user's yes, on the working branch (never `main`):

```bash
npm run release -- <X.Y.Z>          # npm version --no-git-tag-version: package.json + lockfile only
git add package.json package-lock.json
git commit -m "chore(release): v<X.Y.Z>"
```

Keep it a separate commit (the release notes skip `chore(release)` subjects). Tell the user the
release goes out when this branch is merged to `main`. Push, open or merge a PR only if asked.

If `main` gains a release before this branch merges, the branch's version may no longer be above the
latest tag (`tag-release.yml` then fails): re-propose and bump again before merging.

## 3. Confirm the release published

Only after the user says it was merged (or asks you to check):

```bash
gh run list --workflow tag-release.yml --limit 1       # tagger succeeded?
gh run list --workflow release-android.yml --limit 1   # release run started and finished?
gh release view v<X.Y.Z> --json name,isPrerelease,assets --jq '{name, isPrerelease, assets: [.assets[].name]}'
```

Report plainly: the tag exists, the release run's conclusion, and whether the release has
`step-tracker-<X.Y.Z>.apk`. If a step failed, show `gh run view <id> --log-failed` instead of
claiming success. Do not re-run, re-tag or delete a release without asking.
