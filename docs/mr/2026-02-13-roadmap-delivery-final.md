## MR 메타
- 제목: `Reliability/UX roadmap delivery: rclone retry jitter + transfers rerender reduction`
- Source branch: `mr/roadmap-delivery-2026-02-13`
- Target branch: `main`
- Linked issue: `N/A` (연결 이슈 없음)

## 요약
- 로드맵 P2-6/7/8 항목을 한 배치로 정리했습니다.
- 백엔드 rclone retry에 jitter를 포함한 지수 백오프를 적용하고, Compose/Helm에서 운영 튜닝이 가능하도록 env를 노출했습니다.
- Transfers drawer는 row 메모이제이션과 안정적인 콜백 전달로 단일 진행 업데이트 시 전체 리스트 재렌더를 줄였습니다.

## 관련 항목
- Roadmap: `docs/ROADMAP.md` (P2-6, P2-7, P2-8)
- API/스펙: OpenAPI 변경 없음

## 변경 범위
- 포함:
  - 백엔드 재시도 안정화(jitter 포함)
  - 배포 설정/샘플 env 노출
  - Transfers UI 렌더 최적화
  - 로드맵/MR 템플릿/운영 문서 동기화
- 제외:
  - 신규 API 엔드포인트
  - DB 스키마/마이그레이션

## 핵심 변경점
- 백엔드:
  - `RCLONE_RETRY_JITTER_RATIO` 추가, 지터 계산 및 안전 범위 처리
  - `rclone_retry_test` 보강
- 프론트엔드(UI/UX):
  - `TransferDownloadRow`, `TransferUploadRow`를 `memo` 처리
  - `TransfersDrawer`에서 inline 콜백 제거(task id 전달 방식)
- 배포/인프라:
  - `RCLONE_RETRY_ATTEMPTS`, `RCLONE_RETRY_BASE_DELAY`, `RCLONE_RETRY_MAX_DELAY`, `RCLONE_RETRY_JITTER_RATIO`를 compose/chart에 노출
  - chart schema 검증 규칙 추가
- 문서:
  - `README.md`, `docs/USAGE.md`, `docs/JOB_RCLONE_MAP.md`, `docs/FAILURE_TAXONOMY.md`, `docs/ROADMAP.md`
  - `.gitlab/merge_request_templates/roadmap-delivery.md`

## 검증 결과
- [x] `GOTMPDIR=/home/homelabird/Documents/project/s3desk/.tmp/go-build GOCACHE=/home/homelabird/Documents/project/s3desk/.tmp/go-cache CGO_ENABLED=0 go test ./internal/jobs -run RcloneRetryDelay -count=1`
- [x] `helm lint charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml`
- [x] `helm template s3desk charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml >/tmp/s3desk-render.yaml`
- [x] `docker compose -f docker-compose.yml config`
- [x] `docker compose -f docker-compose.postgres.yml config`
- [x] `docker compose -f docker-compose.e2e.yml config`
- [x] `npx eslint src/components/transfers/TransferDownloadRow.tsx src/components/transfers/TransferUploadRow.tsx src/components/transfers/TransfersDrawer.tsx`
- [x] `npm run build` (frontend)

## 사용자 영향
- Breaking change: 없음
- 운영자 액션: 선택 사항(기본값 유지 가능, 필요 시 retry env만 튜닝)
- 기본값:
  - attempts=3
  - baseDelay=800ms
  - maxDelay=8s
  - jitterRatio=0.2

## 리스크/롤백
- 리스크:
  - retry 설정 과튜닝 시 지연/재시도 편차
  - Transfers 상호작용 회귀 가능성
- 롤백:
  - 애플리케이션 버전 롤백
  - `RCLONE_RETRY_*` 기존값으로 복원
  - 프론트는 `aad933d` 이전으로 복귀

## 배포 일정 (제안)
- 1) Staging 배포: 2026-02-16 10:00 UTC
- 2) Production canary(10%): 2026-02-17 10:00 UTC
- 3) Production full rollout(100%): 2026-02-18 10:00 UTC
- 4) 배포 후 관찰 윈도우: 각 단계 최소 60분

## 모니터링 포인트
- retry pressure(%)
- final failure ratio(%)
- retry effectiveness
- Transfers drawer 상호작용 지연/프레임 저하

## 포함 커밋
- `5812e6a` feat(jobs): add configurable retry jitter for rclone retries
- `8418d7a` chore(deploy): expose rclone retry tuning env in samples and chart
- `fadb598` docs(roadmap): sync completed reliability and UX milestones
- `0c6a2e9` chore(gitlab): add roadmap delivery MR template
- `aad933d` perf(transfers): reduce drawer rerenders and sync roadmap
- `394c1e5` docs(mr): add roadmap delivery draft body
