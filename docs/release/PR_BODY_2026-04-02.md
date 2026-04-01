# Summary

이번 PR은 `uploads`, 인증/provider, `ProfilesPage`, `BucketsPage`, backup sidebar, realtime/origin 보안 경계, 그리고 검증 스크립트 체계를 정리한 품질 안정화 작업입니다.

핵심 목표는 다음 3가지였습니다.

- 대형 orchestration 파일을 실제로 분해해서 유지보수성을 높이기
- backend remote/realtime 경계와 upload validation을 더 엄격하게 만들기
- `fast`/`full` 검증 경로를 신뢰할 수 있게 정리하기

# What Changed

## Frontend structure cleanup

- `AuthProvider`와 `APIClientProvider` 경계를 정리하고 hook을 provider 파일에서 분리했습니다.
- `ProfilesPage`의 데이터, YAML import/export, dialog wiring을 분리했습니다.
- `BucketsPage`의 state/query, list rendering, dialog/action wiring을 분리했습니다.
- `SidebarBackupAction`의 backup/restore orchestration과 render block을 section/hook 단위로 분리했습니다.

대표 파일:

- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/useAuth.ts`
- `frontend/src/api/APIClientProvider.tsx`
- `frontend/src/api/useAPIClient.ts`
- `frontend/src/pages/ProfilesPage.tsx`
- `frontend/src/pages/BucketsPage.tsx`
- `frontend/src/components/SidebarBackupAction.tsx`

## Upload handler decomposition

- upload 경계를 `common`, `validation`, `errors`, `limits`, `parts`, `direct`, `staging`, `presign`, `commit` 하위 파일로 분리했습니다.
- multipart/chunk/direct/staging 흐름의 validation 중복을 줄였습니다.
- multipart complete/abort precondition 테스트를 추가했습니다.

대표 파일:

- `backend/internal/api/handlers_uploads_common.go`
- `backend/internal/api/handlers_uploads_validation.go`
- `backend/internal/api/handlers_uploads_direct.go`
- `backend/internal/api/handlers_uploads_staging.go`
- `backend/internal/api/handlers_uploads_commit_api.go`

## Backend security hardening

- realtime ticket 발급과 WS/SSE 연결에 trusted `Origin` 정책을 적용했습니다.
- `ALLOW_REMOTE` 운영 시 `ALLOWED_HOSTS`, `ALLOWED_LOCAL_DIRS`를 fail-closed로 강화했습니다.
- method allowlist, unsafe token rejection, 추가 보안 헤더, timeout/header limit을 정리했습니다.

대표 파일:

- `backend/internal/api/realtime_origin.go`
- `backend/internal/api/middleware.go`
- `backend/internal/api/handlers_realtime_ticket.go`
- `backend/internal/app/app.go`
- `backend/internal/config/warnings.go`

## Validation and developer workflow

- focused backend repro 스크립트를 추가하고 `check.sh fast` 실패 시 자동으로 이어서 실행되게 했습니다.
- `frontend build + backend test` 최소 CI pair 실행 스크립트를 추가했습니다.
- `TESTING.md`와 문서를 focused repro 기준으로 정리했습니다.

대표 파일:

- `scripts/repro_backend_focus.sh`
- `scripts/check.sh`
- `scripts/check_ci_pair.sh`
- `docs/TESTING.md`

# Validation

- `bash ./scripts/check.sh fast` 통과
- `bash ./scripts/check.sh full` 통과
- backend:
  - `go test ./...`
  - `staticcheck`
  - `gosec`
  - `govulncheck`
- frontend:
  - `lint`
  - unit tests
  - `build`
- browser smoke 통과

# Risk / Rollout Notes

- remote 운영 환경은 이전보다 더 엄격하게 fail-closed 됩니다.
- 배포 환경에서 `ALLOW_REMOTE`, `ALLOWED_HOSTS`, `ALLOWED_LOCAL_DIRS` 값이 맞지 않으면 기동 실패가 날 수 있습니다.
- `govulncheck`는 현재 코드 경로로 도달하지 않는 imported/required module 이슈를 informational로 보고하지만, 게이트는 통과했습니다.
