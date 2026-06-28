---
name: merge
description: Squash-merge the current dev branch into ox-hugo and push to publish the site. Use when the user wants to merge, ship, publish, or deploy their dev work to the live site (book.rymcg.tech). Only runs from the dev branch.
---

# /merge — squash dev into ox-hugo and publish

Squash-merge the work on `dev` into the `ox-hugo` branch and push it, which
triggers the GitHub Pages deploy (`.github/workflows/deploy.yaml`) that
publishes https://book.rymcg.tech.

Work through these steps in order. **Stop and report** if any safety check
fails — do not force, override, or invent fixes.

## 1. Confirm we are on `dev`

```
git rev-parse --abbrev-ref HEAD
```

If the branch is **not** `dev`, stop: tell the user `/merge` only runs from the
`dev` branch and report which branch they are on. Do nothing else.

## 2. Confirm a clean working tree

```
git status --porcelain
```

If there is any output (uncommitted changes), stop and report. The merge should
only ship committed work. (Note: on `dev` the repo auto-commits/pushes after
edits, so this is usually already clean.)

## 3. Sync both branches with the remote

```
git fetch origin
```

Confirm local `dev` is not behind `origin/dev`:

```
git rev-list --left-right --count origin/dev...dev
```

If `dev` is behind origin (left count > 0), stop and tell the user to reconcile
first. Also note `origin/ox-hugo` so the merge targets the current tip.

## 4. Review the diff from `ox-hugo` — is it small and sane?

```
git diff --stat ox-hugo..dev
git log --oneline ox-hugo..dev
```

Then read the actual changes:

```
git diff ox-hugo..dev
```

Judge whether the diff is **small and sane**:

- Mostly source files (`.org`, `emacs.d/`, `hugo/themes/`, `_script/`, config)
  — i.e. the kinds of files a human edits.
- **No** generated output (`hugo/content/`, `hugo/content-live/`, `public/`)
  or other gitignored artifacts sneaking in.
- No unexpectedly large binary blobs (image LFS assets are fine, but flag
  anything surprising).
- No secrets, no obviously-broken or unrelated changes.

Summarize the diff for the user (files touched, commit list, rough size). If it
looks large, surprising, or unsafe, **stop and ask the user to confirm** before
merging. If it is clearly small and sane, say so and continue.

## 5. Squash-merge into `ox-hugo`

Do the merge without leaving `dev` checked out longer than necessary:

```
git checkout ox-hugo
git pull --ff-only origin ox-hugo
git merge --squash dev
git commit -m "<one concise line summarizing the dev changes>"
```

Use a **single-line commit message** (per the repo axioms) that summarizes what
this batch of dev work does — not a list of every commit.

If `git merge --squash` reports conflicts, stop, report them, and switch back to
`dev` (`git checkout dev`) without committing. Do not attempt to resolve
conflicts as part of `/merge`.

## 6. Push to publish

```
git push origin ox-hugo
```

This push to `ox-hugo` is what deploys the site. Confirm the push succeeded.

## 7. Return to `dev`

```
git checkout dev
```

Leave the user back on `dev` where they do their work.

## 8. Report

Tell the user:

- That `ox-hugo` was updated and pushed (deploy triggered).
- The squash commit message used.
- That the live site at https://book.rymcg.tech will update once the GitHub
  Actions deploy finishes.
