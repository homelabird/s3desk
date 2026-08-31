# 남은 구조 부채 우선순위

## 2026-08-31 품질 개선 갱신

Jobs 조회 batch, 요청 취소, 전송 상태 저장 coalescing, 큰 payload 렌더·검색 및 즐겨찾기 정렬 비용은 로컬 전체 게이트로 마감했다. 이번 갱신에서는 profile benchmark cleanup/cancellation, backup archive 방어, remote backup 입력 검증, `/uploads` profile gate, 문서 변경 gitleaks 경계, 재개 upload chunk-status batch, PostgreSQL 검색/CI, Settings lazy fallback까지 보강해 문서화된 owner-local 후속 항목을 닫았다.

### 완료. 재개 업로드의 파일별 chunk-status 요청 batch화

- `POST /uploads/{uploadId}/chunks/batch`는 최대 100개 파일과 합계 10,000개 chunk로 작업량을 제한하고, batch마다 profile/session과 multipart metadata 조회를 공유한다.
- frontend는 파일 수와 합계 chunk 수를 함께 기준으로 batch를 나누며, 구버전 서버의 route 404에서는 기존 단일-file GET으로 되돌아간다.
- 응답은 서버 정규화 경로로 엄격하게 대조하고, 취소 신호는 재개 조회가 unavailable인 뒤 대체 session을 만드는 구간까지 유지해 취소 후 업로드가 다시 시작되지 않게 했다.
- staging/direct multipart, item/chunk 상한, 응답 순서·경로 정규화, 404 호환 fallback, 조회 및 session handoff 취소를 backend/frontend 회귀 테스트로 고정했다.

대상:

- `frontend/src/components/transfers/uploadRuntimeResume.ts`
- `frontend/src/api/domains/uploads.ts`
- `backend/internal/api/handlers_uploads_multipart_http.go`
- `openapi.yml`

### 완료. profile benchmark 중단과 원격 임시 객체 정리

- backend는 upload process 시작 직후 request 취소와 무관한 bounded `deletefile` cleanup을 예약하고, 실패·취소·timeout 회귀 테스트로 고정했다.
- frontend는 scope 변경과 대체 요청에서 이전 profile test/benchmark `AbortSignal`을 중단한다.
- 이는 owner-local 정리 보장이다. provider별 실제 원격 삭제 성공은 아래 외부 증거로만 닫는다.

대상:

- `backend/internal/jobs/manager_connectivity.go`
- `frontend/src/pages/profiles/useProfilesPageMutations.ts`
- `frontend/src/api/domains/profiles.ts`

### 완료. PostgreSQL 검색 및 transaction CI 증거

- PostgreSQL object 검색은 prefix/query/extension 조건에 `ILIKE`를 사용해 SQLite의 ASCII 대소문자 동작과 맞췄고, 같은 계약을 두 dialect에서 실행한다.
- GitLab `go_postgres` lane은 disposable PostgreSQL 15에서 transaction invariant와 object 검색 계약을 `-race`로 실행한다.
- protected tag의 Docker Hub publish도 `go_postgres`를 명시적 `needs`로 기다리며, DAG 테스트가 이 순서를 고정한다.

### 완료. Settings lazy fallback

- `frontend/src/FullAppOverlaysHost.tsx`의 Settings lazy boundary는 기존 overlay shell 안에서 접근 가능한 loading 상태와 즉시 동작하는 close action을 제공한다.
- lazy chunk가 준비되면 같은 drawer 계약으로 교체되는 동작을 component test로 고정했다.

### 외부 증거로만 닫을 항목

- provider별 실제 업로드 재개와 benchmark cleanup
- reverse proxy·protected deployment·portable backup candidate evidence
- 실제 대규모 목록의 RUM/p95, 물리 기기 및 보조기술 검증

로컬 fixture, MSW, emulator, Chromium 결과는 위 항목의 완료 증거로 승격하지 않는다. 실제 cardinality나 SLO가 기준을 넘기 전에는 FTS/`pg_trgm`, 장기 cache, HA worker, 새 디자인 시스템을 추가하지 않는다.

## P1

### 1. 남은 page-level orchestration 축소

- `ProfilesPage`는 thin shell + composition state까지 정리됐습니다.
- `BucketsPage`도 thin route + composition state까지 정리됐습니다.
- `Buckets` controller도 query/provider-gating, create mutation이 하위 hook으로 내려갔습니다.
- `Buckets` controller의 scope/view-state 조립도 [useBucketsPageScopeState.ts](../../frontend/src/pages/buckets/useBucketsPageScopeState.ts)로 내려갔습니다.
- `Buckets` controller의 overlay/create/delete wiring도 [useBucketsPageFeatureState.ts](../../frontend/src/pages/buckets/useBucketsPageFeatureState.ts)로 한 단계 더 내려갔습니다.
- controller return surface도 이제 `currentScopeKey + queries + shell` grouped shape로 줄었고, route shell builder도 grouped `shell`을 그대로 넘기도록 단순화됐습니다.
- `Buckets` controller의 shell prop mapping과 loading derivation도 [buildBucketsPageControllerState.ts](../../frontend/src/pages/buckets/buildBucketsPageControllerState.ts) pure builder로 내려갔고, controller hook의 feature-state passthrough 재조립도 제거돼 하위 state 조립에만 더 집중하게 됐습니다.
- `Buckets` controller의 shell/list/dialog/loading view-prop 조립도 [buildBucketsPageShellViewProps.ts](../../frontend/src/pages/buckets/buildBucketsPageShellViewProps.ts)로 분리돼 controller builder는 `currentScopeKey`, query snapshot, shell 조합만 담당합니다.
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

- 현재 목록의 P1 구조 정리와 대부분의 P2/P3 경계 작업은 owner-local 기준으로 마무리됐습니다.
- 현재 문서에 기록된 구체적 owner-local 후속 작업은 마무리됐고, 새 로컬 최적화는 측정된 병목이나 회귀가 생길 때 추가합니다.
- 현재 release 판단의 주된 미충족 항목은 provider·reverse-proxy·portable-backup의 candidate-bound evidence입니다.
- local unit/integration/browser fixture green은 실제 provider, protected deployment, reverse-proxy, backup 운영 증거를 대체하지 않습니다.
