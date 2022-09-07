#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/git-commit-dated.sh [--dry-run] [git commit options...]

Commits with author and committer dates set to the previous commit plus
19 hours and 34 minutes (Gupt repo convention).

Examples:
  scripts/git-commit-dated.sh -m "Fix share route"
  scripts/git-commit-dated.sh --dry-run
  scripts/git-commit-dated.sh -m "Update banner" -- src/App.vue
EOF
}

dry_run=false
commit_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    *)
      commit_args+=("$1")
      shift
      ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

if ! git rev-parse HEAD >/dev/null 2>&1; then
  echo "error: no commits yet; set an initial commit date manually" >&2
  exit 1
fi

last_iso=$(git log -1 --format='%aI')
next_iso=$(python3 -c "
from datetime import datetime, timedelta
last = datetime.fromisoformat('${last_iso}')
print((last + timedelta(hours=19, minutes=34)).isoformat(timespec='seconds'))
")

echo "Previous commit: $last_iso"
echo "Next commit:     $next_iso"

if [[ "$dry_run" == true ]]; then
  exit 0
fi

if [[ ${#commit_args[@]} -eq 0 ]]; then
  echo "error: pass git commit arguments (e.g. -m \"message\")" >&2
  usage
  exit 1
fi

export GIT_AUTHOR_DATE="$next_iso"
export GIT_COMMITTER_DATE="$next_iso"
git commit "${commit_args[@]}"