# S3Desk Sub-Agent Gap Report - 2026-05-21

대상: `/home/homelab/Downloads/project/s3desk`
기준: `main` branch 로컬 작업트리
작성 방식: 4개 전문가 sub-agent 감사와 로컬 구현/검증 결과 종합

## 1. 분석 범위

이번 후속 감사는 다음 역할로 분리했다.

- Backend/security: API, storage, portable backup/import, rclone execution boundary
- Frontend/state/UX: React Query cache, realtime updates, object/job views, accessibility
- CI/release/deployment: GitHub/GitLab gates, release evidence, workflow trust boundary
- Test/architecture: coverage gaps, generated artifacts, module boundaries, drift checks

Sub-agent는 코드 수정 없이 부족한 점을 식별했고, 개선은 로컬에서 재현 가능하고 회귀 테스트를 붙일 수 있는 고우선순위 항목부터 적용했다.

## 2. 종합 판정

즉시 원격 코드 실행으로 이어지는 `P0` 코드 결함은 확인되지 않았다. 다만 GitHub repository 설정에서 `main` branch required status checks가 꺼져 있는 외부 설정 리스크가 확인됐다. 이는 repository setting 변경이 필요하므로 코드 커밋만으로 닫을 수 없다.

이번 후속 패스에서 코드로 닫은 핵심 항목은 다음이다.

- remote non-loopback 실행 시 weak/missing `API_TOKEN`, missing `ENCRYPTION_KEY`, missing `ALLOWED_HOSTS` startup 차단
- remote/demo/e2e/portable smoke compose와 문서의 token/key 요구사항 정렬
- portable replace import가 destination의 queued/running job을 덮어쓰지 못하도록 409 차단
- portable upload session prefix 검증의 문자열 prefix 우회 방지
- release evidence secret scanner에 database URL credential과 `*_PASSWORD` 값 탐지 추가

이전 패스에서 이미 닫은 주요 항목은 portable entity 누락, rclone job API preflight 범위, asset copy descriptor 누수, legacy restore 경고, keyboard chord timeout, logout cache clear, browser-facing E2E path filter, ownership 문서화다.

## 3. 신규 부족한 점과 처리 결과

### P0. GitHub branch protection required checks 비활성화

`gh api repos/homelabird/s3desk/branches/main/protection` 확인 결과 `required_status_checks`가 `null`이고 ruleset도 비어 있었다.

영향:

- Release Gate, Frontend E2E, License Audit 실패가 merge를 막지 못할 수 있다.
- 문서와 workflow verifier가 전제하는 보호 정책이 GitHub 서버 설정에서는 보장되지 않는다.

처리 상태:

- 코드로 강제할 수 없는 외부 설정이다.
- GitHub branch protection 또는 ruleset에서 실제 check-run 이름 기준 required checks와 PR review gate를 켜야 한다.

### P1. remote deployment token/key hardening 부족

기존 remote startup guard는 non-loopback bind에서 token 존재와 placeholder만 막고, token 길이와 `ENCRYPTION_KEY` 누락은 강제하지 않았다.

이번 개선:

- `validateRemoteAccessConfig`를 분리하고 remote non-loopback bind에서 `API_TOKEN` 최소 32 bytes, non-placeholder, `ENCRYPTION_KEY`, `ALLOWED_HOSTS`를 startup blocker로 강제했다.
- app 단위 테스트로 missing/weak token, placeholder, missing key, missing hosts, loopback 예외를 고정했다.
- remote/demo/e2e/portable smoke compose, `.env.example`, runbook, testing 문서를 새 정책에 맞췄다.

### P1. portable replace import와 실행 중 job 충돌

portable replace import는 destination 전체 테이블을 삭제/교체하므로 queued/running job이 있으면 destination job state와 object state를 중간에 끊을 수 있었다.

이번 개선:

- import transaction 시작 시 destination의 queued/running job을 집계해 존재하면 `ErrPortableImportActiveJobs`로 중단한다.
- API 응답은 HTTP `409`와 `portable_import_blocked`로 매핑했다.
- store 테스트로 active job 차단을 고정했다.

### P1. release evidence secret scanning 공백

release evidence scanner가 provider/API token과 backup password는 잡지만 `DATABASE_URL=postgres://user:pass@...` 및 일반 `*_PASSWORD` 할당값은 놓칠 수 있었다.

이번 개선:

- database URL userinfo password 탐지와 `DATABASE_URL`/`*_PASSWORD` assignment 탐지를 추가했다.
- backup password 전용 remediation은 유지하고, DB/password secret 회귀 테스트를 추가했다.

### P2. portable upload prefix boundary 우회

기존 검증은 `strings.HasPrefix(objectKey, session.Prefix)`라서 prefix가 `foo`일 때 `foobar/object.txt`가 통과할 수 있었다.

이번 개선:

- object key가 prefix와 정확히 같거나 `prefix/` 하위일 때만 허용하도록 helper를 추가했다.
- boundary 단위 테스트를 추가했다.

## 4. 남은 주요 리스크

### P1. rclone endpoint egress/DNS rebinding

rclone 실행 경로는 provider endpoint를 실행 직전 동일한 egress guard로 재검증하지 않는다. API 저장 시점 검증과 실행 시점 DNS 해석 사이에 TOCTOU/DNS rebinding 리스크가 남는다.

권장 조치:

- rclone 실행 직전 endpoint 재해석과 private/link-local 차단을 수행한다.
- 장기적으로는 guarded proxy 또는 명시 allowlist 기반 egress boundary를 설계한다.

### P1. frontend cache coherence

copy/move/rename job 생성 후 Objects query가 완료 시점에 무효화되지 않아, job은 성공했지만 object 목록은 stale하게 남을 수 있다. 또한 realtime job status handler가 filter가 다른 job query cache까지 패치할 수 있다.

권장 조치:

- mutating job 완료 이벤트에서 관련 bucket/object prefix query를 invalidate한다.
- job realtime cache patch는 query key filter와 status filter를 만족하는 캐시에만 적용한다.

### P1. release/deploy trust boundary

GitLab release/deploy는 protected tag 설정에 의존하고, GitHub/GitLab CI 일부 dependency/action은 mutable reference 또는 optional checksum에 의존한다. release artifact signing, attestation, SBOM도 아직 기본화되지 않았다.

권장 조치:

- release job을 protected tag와 protected environment로 제한한다.
- critical actions/images/tooling을 SHA/digest/checksum으로 pinning한다.
- release artifact에 checksum, signature, provenance, SBOM을 함께 발행한다.

### P1. generated notice drift

`scripts/check.sh`가 notice generator를 실행하면서 `Generated at <latest commit time>` 같은 생성 파일을 더럽힐 수 있다. 비교 로직이 해당 줄을 무시하더라도 작업트리 변동은 남을 수 있다.

권장 조치:

- generator를 temp output 비교 방식으로 바꾸거나 timestamp를 deterministic하게 만든다.

### P2. frontend performance and UX

Objects grid와 mobile Jobs list가 large result set에서 DOM을 선형으로 늘릴 수 있고, keyboard navigation은 prefix row를 자연스럽게 포함하지 못한다. preview thumbnail cache도 full-size blob을 오래 들고 있을 수 있다.

권장 조치:

- object/job list virtualization을 별도 성능 작업으로 진행한다.
- prefix row keyboard navigation과 thumbnail downscale/cache eviction을 보강한다.

### P2. test/release coverage

minimal CI pair에 OpenAPI drift check가 빠져 있고, production bundle 기준 Playwright lane, Go race smoke, backend coverage hotspot 보강이 남아 있다.

권장 조치:

- `openapi.yml` drift check를 minimal lane에 포함한다.
- 핵심 browser lane 하나는 Vite dev server가 아니라 production preview로 고정한다.
- shared backend package에는 targeted unit coverage와 race smoke를 추가한다.

## 5. 이번 후속 개선 파일

- `.env.example`
- `.github/workflows/frontend-e2e.yml`
- `backend/cmd/server/main.go`
- `backend/internal/app/app.go`
- `backend/internal/app/app_test.go`
- `backend/internal/api/handlers_server_portable.go`
- `backend/internal/store/store_portable.go`
- `backend/internal/store/store_portable_test.go`
- `compose/demo/compose.yml`
- `compose/remote/caddy.yml`
- `compose/remote/compose.yml`
- `compose/test/e2e.yml`
- `compose/test/portable-smoke.yml`
- `docs/PORTABLE_BACKUP.md`
- `docs/RUNBOOK.md`
- `docs/TESTING.md`
- `docs/ci/e2e_live.env.example`
- `scripts/check_release_evidence.py`
- `scripts/check_release_evidence_test.py`
- `scripts/compose.sh`
- `scripts/demo/seed-s3desk.py`
- `scripts/portable/run-failure-smoke.py`
- `scripts/portable/run-smoke.py`
- `scripts/portable/seed-source.py`
- `scripts/run_portable_failure_smoke.sh`

## 6. 검증 상태

이번 후속 패스에서 통과한 검증:

- `cd backend && go test ./internal/app ./internal/store ./internal/api`
- `python3 scripts/check_release_evidence_test.py`
- `python3 scripts/check_github_workflows_test.py`
- `bash scripts/check_github_workflows.sh`
- `bash scripts/check_release_gate.sh`
- `git diff --check`

## 7. 다음 우선순위

1. GitHub branch protection/ruleset에서 required status checks와 PR review gate를 켠다.
2. rclone endpoint 실행 시점 egress guard 설계를 진행한다.
3. frontend Objects cache invalidation과 filtered Jobs realtime patch를 수정한다.
4. release artifact signing/provenance/SBOM과 dependency pinning을 강화한다.
5. generated notice drift와 OpenAPI drift/minimal lane 공백을 닫는다.
