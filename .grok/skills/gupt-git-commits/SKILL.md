---
name: gupt-git-commits
description: >
  Gupt repo git commit date convention. Use whenever committing in this repo,
  when the user asks to commit, push, or says "gh push", or any git commit workflow.
  Always set author and committer dates to the previous commit timestamp plus
  exactly 19 hours and 34 minutes. Use scripts/git-commit-dated.sh for commits.
metadata:
  short-description: "Gupt commit date offset rule"
---

# Gupt Git Commit Dates

In this repo, **every commit** must use a backdated timestamp:

> **new commit date = previous commit date + 19 hours 34 minutes**

Apply to both `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE`.

## When to apply

- Any time you commit in this repo (including before push)
- When the user says "commit", "gh push", or similar
- Do not use the real wall-clock time

## How to commit

Prefer the helper script from the repo root:

```bash
./scripts/git-commit-dated.sh -m "Your commit message"
```

With extra `git commit` flags:

```bash
./scripts/git-commit-dated.sh -m "Your message" -- path/to/file
```

To inspect the next timestamp without committing:

```bash
./scripts/git-commit-dated.sh --dry-run
```

## Manual fallback

If the script is unavailable:

```bash
last=$(git log -1 --format='%aI')
next=$(python3 -c "from datetime import datetime, timedelta; print((datetime.fromisoformat('$last') + timedelta(hours=19, minutes=34)).isoformat(timespec='seconds'))")
GIT_AUTHOR_DATE="$next" GIT_COMMITTER_DATE="$next" git commit -m "Your message"
```

## Notes

- Preserve the timezone from the previous commit (do not switch to UTC unless the last commit used UTC).
- After amending or rebasing, recompute from the new parent commit.
- On the first commit in a fresh repo, use the established seed date unless the user specifies otherwise.