#!/bin/sh
# Restores a backup.sh dump into the running postgres service. Destructive --
# drops and recreates every table in $DB_NAME. Confirm before running against
# anything other than a disposable/test instance of this stack.
#
# Usage: restore.sh <path-to-dump.sql.gz>
set -eu
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env

dump_file="${1:?usage: restore.sh <path-to-dump.sql.gz>}"

gunzip -c "$dump_file" | docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME"
