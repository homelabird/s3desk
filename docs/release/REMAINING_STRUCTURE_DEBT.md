# 남은 구조 부채 우선순위

## P1

### 1. 남은 page-level orchestration 축소

- `ProfilesPage`는 thin shell + composition state까지 정리됐습니다.
- `BucketsPage`도 thin route + composition state까지 정리됐습니다.
- `Buckets` controller도 query/provider-gating, create mutation이 하위 hook으로 내려갔습니다.
- `Buckets` controller의 scope/view-state 조립도 [useBucketsPageScopeState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/useBucketsPageScopeState.ts)로 내려갔습니다.
- `Buckets` controller의 overlay/create/delete wiring도 [useBucketsPageFeatureState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/useBucketsPageFeatureState.ts)로 한 단계 더 내려갔습니다.
- controller return surface도 이제 `currentScopeKey + queries + shell` grouped shape로 줄었고, route shell builder도 grouped `shell`을 그대로 넘기도록 단순화됐습니다.
- `Buckets` controller의 shell prop mapping과 loading derivation도 [buildBucketsPageControllerState.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/buildBucketsPageControllerState.ts) pure builder로 내려갔고, controller hook의 feature-state passthrough 재조립도 제거돼 하위 state 조립에만 더 집중하게 됐습니다.
- 현재 남은 우선 작업은 `Buckets` 쪽보다 P2 보안/CI matrix 정리가 더 큽니다.

대상:

- `frontend/src/pages/buckets/useBucketsPageControllerState.ts`
- `frontend/src/pages/buckets/useBucketsPageScopeState.ts`
- `frontend/src/pages/buckets/useBucketsPageFeatureState.ts`
- `frontend/src/pages/buckets/buildBucketsPageShellProps.ts`

### 2. upload commit 경계의 추가 단순화

- 현재는 이미 많이 분해됐고 staging/direct/presigned 실행 orchestration도 `uploadCommitExecutionService`로 모였습니다. direct/presigned server-level helper도 execution service 내부 메서드로 흡수됐습니다.
- immediate finalize/publish도 `uploadCommitFinalizeService`로 모였고 duplicate cleanup도 제거됐습니다.
- verification planning / S3 verify도 `uploadCommitVerificationService`로 모였습니다.
- API decode/session load도 `uploadCommitRequestService`, artifact build도 `uploadCommitArtifactService`로 모였고 `uploadCommitPreparedRequest`, `executeUploadCommit`, `prepareImmediateUploadCommit`, artifact compat wrapper, verification plan wrapper, staging-payload/finalize server wrapper 같은 thin bridge도 제거됐습니다.
- `upload commit` 경계 정리는 사실상 마무리 단계고, 남은 일은 service 내부 동작이 다시 비대해질 때만 세부 helper를 더 나누는 정도입니다. 다음 우선순위는 realtime/security matrix 확대 쪽이 더 큽니다.

대상:

- `backend/internal/api/handlers_uploads_commit_execution.go`
- `backend/internal/api/handlers_uploads_commit_request_service.go`
- `backend/internal/api/handlers_uploads_commit_artifact_service.go`
- `backend/internal/api/handlers_uploads_commit_finalize_service.go`
- `backend/internal/api/handlers_uploads_commit_verify_service.go`
- `backend/internal/api/handlers_uploads_commit_http.go`

## P2

### 3. realtime/security 정책 테스트의 matrix 확대

- 현재 origin/host 조합 테스트는 proxy header spoofing 무시, uppercase HTTPS origin, malformed/null origin strict-form rejection(empty-host/trailing slash/path/query/fragment/userinfo/opaque null/file/unsupported scheme), invalid-port origin rejection, mixed host casing, allowlisted mixed-case trailing-dot host, IPv6 ULA, allowlisted IPv6 ULA normalization, matching CORS allowlist handling, realtime ticket/auth flow propagation, SSE/WS transport limit/success path의 malformed-origin rejection과 allowlisted IPv6 ULA/custom-host success path, direct SSE/WS handler slot-release parity, `requireLocalHost`/CORS helper의 empty-host/trailing-slash/path/query/fragment/userinfo/file/unsupported-scheme reject parity, 그리고 allowlisted mixed-case host/IPv6 ULA의 realtime ticket issue, service-level ticket create, `executeCreate(...)`/`executePrepared(...)` helper, `prepareRealtimeRequest(...)` slot release, SSE/WS ticket-auth consume success path와 malformed-origin reject-without-consume parity, websocket-origin/helper short-circuit parity, missing/null/empty-host/trailing-slash/path/query/fragment/userinfo/file/unsupported-scheme/invalid-port/internal-error parity, `securityHeaders`의 normalized loopback/`*.localhost` trustworthiness parity와 forwarded-proto/forwarded-host spoofing의 upgrade/downgrade 무시 parity, webview/device picker/clipboard secure-context messaging parity, frontend unit-test parity, secure-context wording centralization parity, modal fallback component-test parity, `LocalDevicePathInput` dead-branch cleanup + component-test parity, `UploadSourceSheet` folder-selection fallback/title/helper parity, picker unavailable reason/helper parity와 object/device download fallback parity, local-folder required/error helper parity, readwrite permission-denied helper parity, local-folder access unavailable title parity, local-folder empty-result helper parity, local-device/frontend test expectation helper parity, webview/posture clipboard expectation helper parity, objects/uploads action prerequisite helper parity, uploads disabled-state sentence/label helper parity, object pane/modal/toolbar prerequisite helper parity, jobs upload-disabled helper parity, objects detail/header toolbar status helper parity, bucket empty-state/picker helper parity, bucket placeholder/error helper parity, objects pane empty-bucket helper parity, objects selection-action/helper parity, objects pane/favorites alert helper parity, favorites badge-label helper parity, objects favorites-pane/tree/list status helper parity, 그리고 objects/jobs shortcut/upload-tooltip helper parity까지 포함하도록 더 좋아졌습니다.
- `download proxy`도 `Forwarded` / `X-Forwarded-Proto` precedence, multi-entry `Forwarded` later-proto handling, comma-separated `X-Forwarded-Proto` first-entry-only trust, unsupported proto fallback, external base URL 우선순위, external-base stale query/fragment scrub, forwarded-host spoofing 무시, external-base custom port 유지, metadata hint query 보존, unsupported external-base fallback, userinfo-bearing external-base rejection, external-base dot-segment path normalization, external-base host canonicalization, IPv6 external-base host:port canonicalization, malformed-port rejection, 그리고 public route-level `AllowRemote` private custom-port 허용/public peer forwarded-private spoofing 차단까지 테스트로 고정됐습니다.
- 남은 일은 새 public/download surface가 추가될 때 같은 custom port, forwarded host, external base URL 조합을 회귀 테스트에 같이 붙이는 정도입니다.

대상:

- `backend/internal/api/realtime_origin_test.go`
- `backend/internal/api/middleware_test.go`
- `backend/internal/api/handlers_realtime_limits_test.go`

### 4. 검증 스크립트와 CI 설정의 완전한 일치

- 지금은 로컬 스크립트 품질이 높아졌습니다.
- `check_ci_pair.sh`는 이제 workflow lint, frontend build, backend test를 함께 돌도록 CI 최소 경로에 더 가까워졌고, bundle-budget과 browser lane은 의도적으로 제외된다고 문서화됐습니다.
- `check.sh`, `check_ci_pair.sh`, `TESTING.md`, `RELEASE_GATE.md`도 이제 `release-gate`, `Core Mock E2E`, `Mobile Responsive E2E (Required)` 같은 exact GitHub check 이름을 직접 언급하면서 로컬 명령과 CI check의 대응 관계를 설명합니다.
- 이 항목의 큰 혼동 구간은 대부분 메워졌고, 남은 일은 required check 이름이나 workflow 구조가 바뀔 때 관련 문서/템플릿을 같이 따라갱신하는 정도입니다.

대상:

- `scripts/check.sh`
- `scripts/check_ci_pair.sh`
- `docs/TESTING.md`

## P3

### 5. provider/state 경계 문서화

- `FRONTEND_STATE_BOUNDARIES.md`가 이제 `AuthProvider`, `APIClientProvider`, `FullApp` controller split, page shell/controller/composition layering까지 설명합니다.
- 이 항목의 큰 공백은 메워졌고, 남은 일은 새 page split 예시가 늘어날 때 문서 예시를 같이 갱신하는 정도입니다.

대상:

- `docs/FRONTEND_STATE_BOUNDARIES.md`
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/api/APIClientProvider.tsx`

### 6. backup sidebar의 domain hook 명명 정리

- `SidebarBackupAction`이 의존하는 훅 이름은 이제 `useBackupDrawerState`, `useStagedRestoreInventory`로 정리돼 export/restore/import state와 staged restore inventory 책임이 이름에서 바로 드러납니다.
- 이 항목의 큰 공백은 메워졌고, 남은 일은 backup drawer 내부 동작이 더 커질 때 export/restore/import sub-hook을 추가로 세분화하는 정도입니다.

대상:

- `frontend/src/components/useBackupDrawerState.ts`
- `frontend/src/components/useStagedRestoreInventory.ts`

## 결론

- 지금 가장 중요한 남은 부채는 동작 불안정이 아니라 경계의 마지막 20% 정리입니다.
- 우선순위는 `page orchestration 축소 -> upload commit 단순화 -> security matrix 확대 -> CI/문서 정합성` 순서가 맞습니다.
