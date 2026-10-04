# SQLite / PostgreSQL Migration Validation — 2026-10-04

## Scope

- Base commit: `17725cdf2f36478c003903532366ec4835335f28`.
- Tested snapshot: that base plus the uncommitted migration changes described below.
  This record validates the local working tree, not a published release.
- Environment: local Podman Compose, SQLite, disposable PostgreSQL 15.19, and
  the maintained SeaweedFS S3 fixture. Existing demo containers were preserved.
- Source fingerprint: `76dbb1bbc0e48508aa762b2cb74721af5fa7977bb98cf9351bae29ef2fdae9e8`.
  SHA-256 covers each path followed by NUL, file contents, and NUL, in this order:
  `backend/internal/api/handlers_server_portable_apply.go`,
  `backend/internal/api/handlers_server_portable_request.go`,
  `backend/internal/store/store_portable.go`,
  `backend/internal/store/store_profile_secrets.go`,
  `scripts/portable/run-smoke.py`, `scripts/portable/seed-source.py`.

## Reproduced Problems and Repairs

1. Preview returned `ready` while destination jobs or local staging uploads
   prevented replacement. Preview now uses the existing destination guard, and
   replacement repeats that guard inside its transaction. Blocked requests leave
   all nine entity checksums unchanged.
2. Importing plaintext credentials into a target configured for encryption left
   those credentials plaintext. Startup and import now share the same encryption
   helper. Import encrypts S3, Azure, and GCS row values before SQL insertion;
   existing ciphertext and portable timestamps are retained.
3. Encrypted GCS service-account data was validated as JSON ciphertext, blocking
   otherwise valid migrations. Validation now decrypts it with the configured
   key and applies the existing JSON and token-URI checks. Missing or wrong keys,
   unsafe token URIs, and empty required credentials remain blocked.

## Runtime Matrix

Each command used `S3DESK_COMPOSE_PROVIDER=podman`, its own disposable Compose
project, and the final source fingerprint above. Encrypted positive cases set
`PORTABLE_BUNDLE_CONFIDENTIALITY=encrypted` and supplied the bundle password
through the private environment. Raw Compose logs were kept outside the
repository because they contain environment arguments.

| Direction | Bundle / scenario | Command | Result |
| --- | --- | --- | --- |
| SQLite → PostgreSQL | clear | `bash scripts/run_portable_sqlite_to_postgres_smoke.sh` | passed |
| PostgreSQL → SQLite | clear | `bash scripts/run_portable_postgres_to_sqlite_smoke.sh` | passed |
| SQLite → PostgreSQL | encrypted | `bash scripts/run_portable_sqlite_to_postgres_smoke.sh` | passed |
| PostgreSQL → SQLite | encrypted | `bash scripts/run_portable_postgres_to_sqlite_smoke.sh` | passed |
| SQLite → PostgreSQL | failure paths | `bash scripts/run_portable_failure_smoke.sh` | passed |
| PostgreSQL → SQLite | failure paths | `bash scripts/run_portable_postgres_to_sqlite_failure_smoke.sh` | passed |

Positive flows verify preview and replacement, imported entities, profile access
against the SeaweedFS fixture, indexed objects, jobs, favorites, and thumbnail
assets. All four also report `busyDestinationPreserved=true` and
`encryptedGCSProfilePreserved=true`. The GCS profile uses synthetic credentials;
these results do not establish real GCS connectivity.

Failure flows cover wrong bundle passwords, destination encryption-key mismatch,
and thumbnail preparation failure before database replacement. Each checks the
expected rejection; the asset-preparation case also compares destination profiles
before and after the failed import. Full entity rollback is additionally checked
by the PostgreSQL store regression below.

Both failure directions returned HTTP 400 for wrong passwords and asset
preparation failures. Key mismatch returned HTTP 200 with the expected blocking
preflight findings. All six commands exited successfully, and their disposable
Compose stacks and volumes were removed afterward.

## Store, API, and CI Checks

Run from `backend/` unless a repository-root path is shown:

| Check | Outcome |
| --- | --- |
| `go test ./...` | passed; 39 packages |
| `go vet ./...` | passed |
| PostgreSQL CI selection below, with a private `S3DESK_TEST_POSTGRES_URL` | passed twice against actual PostgreSQL |
| `python3 scripts/check_gitlab_publish_dag_test.py` | passed |
| `python3 scripts/check_gitlab_publish_dag.py` | passed |
| `python3 scripts/check_release_evidence_checklist.py --candidate-id 0.21v-rc5 --base 0.21v-rc3 --head HEAD` | passed; checklist consistency only |
| `PATH="/tmp/s3desk-node22/bin:$PATH" CHECK_FRONTEND_DEPS_READY=1 CHECK_FRONTEND_MAX_WORKERS=4 ./scripts/check.sh fast` | failed on the existing frontend timeout described below |

```bash
go test -race ./internal/store \
  -run '^(TestPostgresTransactionReliability|TestPostgresObjectIndexSearchIsCaseInsensitive|TestPostgresPortableMigration)$' \
  -v -count=1
```

`TestPostgresPortableMigration` compares complete row content in a
SQLite → PostgreSQL → SQLite round trip for all nine nonempty entities. It covers
251 index and replacement rows across the 250-row batch boundary, Unicode,
quoted keys, SQL NULL versus empty text, and integers larger than JavaScript's
exact-number range. It verifies replacement of existing rows, recovery-callback
and insert rollback, and encryption before SQL insertion. Encrypted PostgreSQL
rows also return unchanged to encrypted SQLite.

The PostgreSQL test helper gives each test its own temporary schema and removes
only that schema afterward. The existing GitLab PostgreSQL lane now includes the
migration test; the exact lane selection passed locally twice.

The broad `fast` check passed backend and static lanes, then failed
`SidebarBackupAction.test.tsx`:
`locks portable inputs while replacing the database and keeps the partial result visible`
exceeded its existing 5-second limit. Frontend totals were 269 files / 1407 tests
passed and one file / one test failed. This timeout had already been observed
before the migration work. That broad run preceded the final encryption
refactor; the backend-wide tests, vet, and PostgreSQL race runs above cover the
final backend source.

## Evidence Limits

- `./scripts/check.sh full` and hosted CI were not run.
- Production databases, real GCS/Azure/S3 providers, deployment, and reverse-proxy
  behavior were not validated by this local migration matrix.
- No deployment, tag, release publication, or production cutover was performed.
