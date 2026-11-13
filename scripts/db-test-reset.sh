#!/usr/bin/env bash
# Recreates a throwaway Postgres database with the Supabase shim + all migrations.
# Usage: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/mf_test scripts/db-test-reset.sh
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${TEST_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/mf_test}"
DB="${URL##*/}"
ADMIN_URL="${URL%/*}/postgres"
psql "$ADMIN_URL" -qc "drop database if exists $DB" -c "create database $DB" >/dev/null
psql "$URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Test database ready: $DB"
