# 남은 구조 부채 우선순위

## P1

### 1. 남은 page-level orchestration 축소

- `ProfilesPage`는 thin shell + composition state까지 정리됐습니다.
- `BucketsPage`도 thin route + composition state까지 정리됐습니다.
- `Buckets` controller도 query/provider-gating, create mutation이 하위 hook으로 내려갔습니다.
- `Buckets` controller의 scope/view-state 조립도 [useBucketsPageScopeState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/useBucketsPageScopeState.ts)로 내려갔습니다.
- 현재 남은 우선 작업은 `Buckets` 계층 전반의 feature wiring 경계를 더 분명하게 다듬는 것입니다.

대상:

- `frontend/src/pages/buckets/useBucketsPageControllerState.ts`
- `frontend/src/pages/buckets/useBucketsPageScopeState.ts`

### 2. upload commit 경계의 추가 단순화

- 현재는 이미 많이 분해됐고 staging/direct/presigned 실행 orchestration도 `uploadCommitExecutionService`로 모였습니다.
- immediate finalize/publish도 `uploadCommitFinalizeService`로 모였고 duplicate cleanup도 제거됐습니다.
- verification planning / S3 verify도 `uploadCommitVerificationService`로 모였습니다.
- API decode/session load도 `uploadCommitRequestService`, artifact build도 `uploadCommitArtifactService`로 모였습니다.
- `upload commit` 경계 정리는 이제 거의 끝났고, 다음 우선순위는 realtime/security matrix 확대 쪽이 더 큽니다.

대상:

- `backend/internal/api/handlers_uploads_commit_execution.go`
- `backend/internal/api/handlers_uploads_commit_request_service.go`
- `backend/internal/api/handlers_uploads_commit_artifact_service.go`
- `backend/internal/api/handlers_uploads_commit_finalize_service.go`
- `backend/internal/api/handlers_uploads_commit_verify_service.go`
- `backend/internal/api/handlers_uploads_commit_http.go`

## P2

### 3. realtime/security 정책 테스트의 matrix 확대

- 현재 origin/host 조합 테스트는 proxy header spoofing 무시, uppercase HTTPS origin, mixed host casing, IPv6 ULA까지 포함하도록 더 좋아졌습니다.
- `download proxy`도 `Forwarded` / `X-Forwarded-Proto` precedence, unsupported proto fallback, external base URL 우선순위까지 테스트로 고정됐습니다.
- 다음은 download proxy와 public/download surfaces 전반의 custom port, forwarded host, external base URL 조합처럼 아직 남은 주변 보안 matrix를 이어서 확장할 가치가 있습니다.

대상:

- `backend/internal/api/realtime_origin_test.go`
- `backend/internal/api/middleware_test.go`

### 4. 검증 스크립트와 CI 설정의 완전한 일치

- 지금은 로컬 스크립트 품질이 높아졌습니다.
- `check_ci_pair.sh`는 이제 workflow lint, frontend build, backend test를 함께 돌도록 CI 최소 경로에 더 가까워졌고, bundle-budget과 browser lane은 의도적으로 제외된다고 문서화됐습니다.
- 다음 단계는 이 경계를 branch protection / required check 설명과 더 직접 연결해서, reviewer가 “pair wrapper green”을 release-ready와 혼동하지 않게 만드는 것입니다.

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
