# 남은 구조 부채 우선순위

## P1

### 1. 남은 page-level orchestration 축소

- `ProfilesPage`와 `BucketsPage`는 많이 줄었지만 page가 여전히 여러 modal/state coordinator 역할을 갖고 있습니다.
- 다음 단계는 page를 route shell로 만들고, mutation/action orchestration을 hook이나 action module로 더 빼는 것입니다.

대상:

- `frontend/src/pages/ProfilesPage.tsx`
- `frontend/src/pages/BucketsPage.tsx`

### 2. upload commit 경계의 추가 단순화

- 현재는 이미 많이 분해됐지만 commit 계층은 아직 orchestration-heavy입니다.
- 목표는 API decode, verification planning, artifact build, finalize publish를 더 명확한 service boundary로 나누는 것입니다.

대상:

- `backend/internal/api/handlers_uploads_commit_api.go`
- `backend/internal/api/handlers_uploads_commit_helpers.go`
- `backend/internal/api/handlers_uploads_commit_finalize.go`

## P2

### 3. realtime/security 정책 테스트의 matrix 확대

- 현재 origin/host 조합 테스트는 좋아졌습니다.
- 다음은 proxy header, HTTPS origin, mixed host casing, IPv6, custom ports까지 matrix를 확장할 가치가 있습니다.

대상:

- `backend/internal/api/realtime_origin_test.go`
- `backend/internal/api/middleware_test.go`

### 4. 검증 스크립트와 CI 설정의 완전한 일치

- 지금은 로컬 스크립트 품질이 높아졌습니다.
- 다음 단계는 CI workflow가 `check_ci_pair.sh`, focused repro 문서, `check.sh` 흐름과 정확히 일치하는지 보장하는 것입니다.

대상:

- `scripts/check.sh`
- `scripts/check_ci_pair.sh`
- `docs/TESTING.md`

## P3

### 5. provider/state 경계 문서화

- `AuthProvider`, `APIClientProvider`, page hook 경계는 코드로는 좋아졌습니다.
- 하지만 새 기여자가 들어오면 어디에 상태를 두어야 하는지 문서 없이 다시 흐려질 가능성이 있습니다.

대상:

- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/api/APIClientProvider.tsx`

### 6. backup sidebar의 domain hook 명명 정리

- 구조는 좋아졌지만 backup/restore 훅 이름과 책임이 조금 더 domain 중심으로 정리될 수 있습니다.
- 다음 리팩터링 때 API naming까지 같이 정리하면 좋습니다.

대상:

- `frontend/src/components/useSidebarBackupOperations.ts`
- `frontend/src/components/useRestoreStaging.ts`

## 결론

- 지금 가장 중요한 남은 부채는 동작 불안정이 아니라 경계의 마지막 20% 정리입니다.
- 우선순위는 `page orchestration 축소 -> upload commit 단순화 -> security matrix 확대 -> CI/문서 정합성` 순서가 맞습니다.
