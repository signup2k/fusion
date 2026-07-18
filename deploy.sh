#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR=${SOURCE_DIR:-"$SCRIPT_DIR"}
DEPLOYMENT_DIR=${DEPLOYMENT_DIR:-"$(dirname -- "$SOURCE_DIR")"}
SSH_HOST=${SSH_HOST:-bwgvps1}
REMOTE_DIR=${REMOTE_DIR:-/root/rssreader-fusion}
DOMAIN=${DOMAIN:-rss.iooi-forfun.cc}
REPOSITORY=${REPOSITORY:-https://github.com/signup2k/fusion.git}
IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-signup2k/fusion}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || die "git is required"
command -v ssh >/dev/null 2>&1 || die "ssh is required"
command -v scp >/dev/null 2>&1 || die "scp is required"

git -C "$SOURCE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  die "$SOURCE_DIR is not a Git repository"

branch=$(git -C "$SOURCE_DIR" branch --show-current)
[ "$branch" = "main" ] || die "deployment requires the local main branch (current: $branch)"

[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ] ||
  die "source repository has uncommitted changes"

printf 'Fetching and publishing main...\n'
git -C "$SOURCE_DIR" fetch origin main
git -C "$SOURCE_DIR" push origin main

commit=$(git -C "$SOURCE_DIR" rev-parse HEAD)
origin_commit=$(git -C "$SOURCE_DIR" rev-parse origin/main)
[ "$commit" = "$origin_commit" ] ||
  die "local main does not match origin/main after push"

short_commit=$(git -C "$SOURCE_DIR" rev-parse --short=7 HEAD)
image="$IMAGE_REPOSITORY:$short_commit"

printf 'Deploying %s as %s to %s...\n' "$commit" "$image" "$SSH_HOST"

ssh "$SSH_HOST" bash -s -- \
  "$commit" "$short_commit" "$image" "$REMOTE_DIR" "$DOMAIN" "$REPOSITORY" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

commit=$1
short_commit=$2
image=$3
remote_dir=$4
domain=$5
repository=$6
source_dir="$remote_dir/source"
compose_file="$remote_dir/compose.yaml"
container_name="rssreader-fusion"
candidate_name="${container_name}-candidate-${short_commit}"
candidate_dir="$remote_dir/.candidate-${short_commit}"
compose_backup=""
previous_image=""
backup_path=""
production_switch_started=0

exec 9>"$remote_dir/.deploy.lock"
flock -n 9 || {
  echo "another deployment is already running" >&2
  exit 1
}

wait_for_health() {
  name=$1
  attempts=${2:-30}
  i=1
  while [ "$i" -le "$attempts" ]; do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || true)
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
      return 1
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

cleanup_candidate() {
  docker rm -f "$candidate_name" >/dev/null 2>&1 || true
  rm -rf "$candidate_dir"
}

rollback() {
  exit_code=$?
  trap - ERR INT TERM
  cleanup_candidate

  if [ "$production_switch_started" -eq 1 ] && [ -n "$compose_backup" ] && [ -f "$compose_backup" ]; then
    echo "deployment failed; restoring previous image: $previous_image" >&2
    cp "$compose_backup" "$compose_file"
    cd "$remote_dir"
    docker compose up -d
    if ! wait_for_health "$container_name" 30; then
      echo "automatic image rollback did not become healthy" >&2
    fi
  fi

  echo "database backup retained at: ${backup_path:-not-created}" >&2
  exit "$exit_code"
}

trap rollback ERR INT TERM
trap cleanup_candidate EXIT

mkdir -p "$remote_dir/backups"

if [ -d "$source_dir/.git" ]; then
  git -C "$source_dir" fetch origin --prune
  git -C "$source_dir" switch main
  git -C "$source_dir" pull --ff-only origin main
else
  git clone --branch main "$repository" "$source_dir"
fi

actual_commit=$(git -C "$source_dir" rev-parse HEAD)
[ "$actual_commit" = "$commit" ] || {
  echo "VPS source commit $actual_commit does not match requested commit $commit" >&2
  exit 1
}
[ -z "$(git -C "$source_dir" status --porcelain)" ] || {
  echo "VPS source repository is dirty" >&2
  exit 1
}

echo "Running backend tests..."
(cd "$source_dir" && ./scripts.sh test-backend)

echo "Building frontend and backend..."
(cd "$source_dir" && ./scripts.sh build-frontend)
(cd "$source_dir" && ./scripts.sh build-backend linux amd64 ./build/fusion-linux-amd64)

echo "Building image $image..."
(
  cd "$source_dir"
  docker build \
    --build-arg TARGETOS=linux \
    --build-arg TARGETARCH=amd64 \
    -t "$image" .
)

echo "Testing candidate image..."
cleanup_candidate
mkdir -p "$candidate_dir"
docker run -d \
  --name "$candidate_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --env-file "$remote_dir/.env" \
  -e FUSION_DB_PATH=/data/fusion.db \
  -e FUSION_CORS_ALLOWED_ORIGINS="https://$domain" \
  -v "$candidate_dir:/data" \
  "$image" >/dev/null

if ! wait_for_health "$candidate_name" 30; then
  docker logs --tail=100 "$candidate_name" >&2 || true
  exit 1
fi
docker exec "$candidate_name" wget -q -O /dev/null http://127.0.0.1:8080/api/oidc/enabled
candidate_database_errors=$(docker logs "$candidate_name" 2>&1 |
  grep -Ec 'disk I/O error|database is locked|SQLITE_BUSY' || true)
[ "$candidate_database_errors" -eq 0 ] || {
  echo "candidate logged $candidate_database_errors SQLite errors" >&2
  false
}
cleanup_candidate

cd "$remote_dir"
if ! grep -Eq '^[[:space:]]*-[[:space:]]*/tmp:' "$compose_file"; then
  compose_tmp="$compose_file.tmpfs-$short_commit"
  cp "$compose_file" "$compose_tmp"
  sed -i '/^[[:space:]]*read_only:[[:space:]]*true/i\    tmpfs:\n      - /tmp:size=64m,mode=1777' "$compose_tmp"
  docker compose -f "$compose_tmp" config --quiet
  mv "$compose_tmp" "$compose_file"
fi
docker compose config --quiet
previous_image=$(docker inspect "$container_name" --format '{{.Config.Image}}')
current_tmpfs=$(docker inspect "$container_name" --format '{{index .HostConfig.Tmpfs "/tmp"}}')

current_health=$(docker inspect "$container_name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')
if [ "$previous_image" = "$image" ] && [ "$current_health" = "healthy" ] && [ -n "$current_tmpfs" ]; then
  [ "$(sqlite3 "$remote_dir/data/fusion.db" 'PRAGMA quick_check;')" = "ok" ]
  curl -fsS "http://127.0.0.1:8010/api/oidc/enabled" >/dev/null
  curl -fsS "https://$domain/" >/dev/null
  trap - ERR INT TERM
  echo "DEPLOYMENT_NOOP commit=$commit image=$image reason=already-healthy"
  exit 0
fi

compose_backup="$remote_dir/.compose-before-${short_commit}.yaml"
cp "$compose_file" "$compose_backup"

timestamp=$(date +%Y%m%d-%H%M%S)
backup_path="$remote_dir/backups/fusion-${timestamp}-before-${short_commit}.db"
echo "Backing up production database to $backup_path..."
sqlite3 "$remote_dir/data/fusion.db" ".backup '$backup_path'"
[ "$(sqlite3 "$backup_path" 'PRAGMA quick_check;')" = "ok" ]

sed -i -E "s|^([[:space:]]*image:).*|\1 $image|" "$compose_file"
docker compose config --quiet

production_switch_started=1
echo "Switching production from $previous_image to $image..."
docker compose stop fusion
sqlite3 "$remote_dir/data/fusion.db" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
docker compose up -d

if ! wait_for_health "$container_name" 45; then
  docker logs --tail=150 "$container_name" >&2 || true
  false
fi

sleep 5
[ "$(sqlite3 "$remote_dir/data/fusion.db" 'PRAGMA quick_check;')" = "ok" ]
curl -fsS "http://127.0.0.1:8010/api/oidc/enabled" >/dev/null
curl -fsS "https://$domain/" >/dev/null

startup_database_errors=$(docker logs "$container_name" 2>&1 |
  grep -Ec 'disk I/O error|database is locked|SQLITE_BUSY' || true)
[ "$startup_database_errors" -eq 0 ] ||
  {
    echo "startup refresh logged $startup_database_errors SQLite errors" >&2
    docker logs "$container_name" 2>&1 |
      grep -E 'disk I/O error|database is locked|SQLITE_BUSY' >&2 || true
    false
  }

observation_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sleep 5
persistent_database_errors=$(docker logs --since "$observation_start" "$container_name" 2>&1 |
  grep -Ec 'disk I/O error|database is locked|SQLITE_BUSY' || true)
[ "$persistent_database_errors" -eq 0 ] || {
  echo "container logged $persistent_database_errors SQLite errors after becoming healthy" >&2
  false
}

image_id=$(docker inspect "$container_name" --format '{{.Image}}')
started_at=$(docker inspect "$container_name" --format '{{.State.StartedAt}}')
log_file="$remote_dir/DEPLOYMENT_LOG.md"

if [ ! -f "$log_file" ]; then
  printf '# Deployment Log\n' >"$log_file"
fi

cat >>"$log_file" <<EOF

## $(date +%F) — $short_commit

- Commit: \`$commit\`
- Image: \`$image\`
- Image ID: \`$image_id\`
- Previous image: \`$previous_image\`
- Database backup: \`$backup_path\`
- Container started: \`$started_at\`
- Validation: backend tests, production build, candidate health, production health, HTTPS, and SQLite checks passed.
- Startup SQLite warnings: \`$startup_database_errors\` (post-health observation: \`$persistent_database_errors\`)
EOF

rm -f "$compose_backup"
production_switch_started=0
trap - ERR INT TERM

echo "DEPLOYMENT_SUCCESS commit=$commit image=$image backup=$backup_path"
REMOTE_SCRIPT

scp "$SSH_HOST:$REMOTE_DIR/compose.yaml" "$DEPLOYMENT_DIR/compose.yaml"
scp "$SSH_HOST:$REMOTE_DIR/DEPLOYMENT_LOG.md" "$DEPLOYMENT_DIR/DEPLOYMENT_LOG.md"

printf 'Deployment complete: https://%s\n' "$DOMAIN"
