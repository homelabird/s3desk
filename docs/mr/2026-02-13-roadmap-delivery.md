## 요약
- 로드맵 P2-6/7 중심으로 안정성(백그라운드 재시도)과 UX(Transfers drawer 응답성) 개선을 함께 반영했습니다.
- rclone 재시도에 jitter를 포함한 지수 백오프를 적용하고, 운영/배포 환경에서 튜닝 가능한 env를 샘플/차트 전반에 노출했습니다.
- Transfers drawer는 row 메모이제이션과 안정적인 콜백 전달로 단일 진행 업데이트 시 리스트 전체 재렌더를 줄였습니다.

## 관련 항목
- Roadmap: `docs/ROADMAP.md` P2-6 Retry/backoff & self-healing, P2-7 UX improvements, P2-8 Observability operations
- Issue: N/A
- API/스펙: OpenAPI 변경 없음

## 변경 범위
- 포함:
  - 백엔드 rclone retry jitter + 테스트
  - 배포 샘플/Helm values 및 schema에 retry env 노출
  - Transfers drawer 렌더 최적화
  - 로드맵/운영 문서 동기화 및 MR 템플릿 추가
- 제외:
  - 신규 API 엔드포인트/응답 스키마 변경
  - DB 스키마/마이그레이션

## 핵심 변경점
- 백엔드:
  - `RCLONE_RETRY_JITTER_RATIO` 기반 jitter 계산 추가 및 clamp 처리
  - 재시도 로직 단위 테스트(`rclone_retry_test`) 보강
- 프론트엔드(UI/UX):
  - `TransferDownloadRow`, `TransferUploadRow`를 `memo`로 감싸고 task id 기반 핸들러 전달로 불필요 재렌더 감소
- 배포/인프라:
  - Compose/Helm에 `RCLONE_RETRY_ATTEMPTS`, `RCLONE_RETRY_BASE_DELAY`, `RCLONE_RETRY_MAX_DELAY`, `RCLONE_RETRY_JITTER_RATIO` 노출
  - Helm schema에 타입/범위 검증 추가
- 문서:
  - `README.md`, `docs/USAGE.md`, `docs/JOB_RCLONE_MAP.md`, `docs/FAILURE_TAXONOMY.md`, `docs/ROADMAP.md` 동기화
  - MR 작성용 템플릿 추가

## 검증 체크리스트
- [x] 단위/통합 테스트 통과(해당 변경 범위)
- [x] `GOTMPDIR=/home/homelabird/Documents/project/s3desk/.tmp/go-build GOCACHE=/home/homelabird/Documents/project/s3desk/.tmp/go-cache CGO_ENABLED=0 go test ./internal/jobs -run RcloneRetryDelay -count=1`
- [x] `helm lint charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml`
- [x] `helm template s3desk charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml >/tmp/s3desk-render.yaml`
- [x] `docker compose -f docker-compose.yml config`
- [x] `docker compose -f docker-compose.postgres.yml config`
- [x] `docker compose -f docker-compose.e2e.yml config`
- [x] `npx eslint src/components/transfers/TransferDownloadRow.tsx src/components/transfers/TransferUploadRow.tsx src/components/transfers/TransfersDrawer.tsx`
- [x] `npm run build` (frontend)
- [x] 변경된 설정/환경변수 문서화 완료

## 사용자 영향
- Breaking change 여부: 없음
- 운영자 액션 필요 여부: 선택 사항(기본값 유지 시 액션 불필요, 필요 시 retry env 튜닝 가능)
- 기본값/마이그레이션:
  - retry 기본값: attempts=3, baseDelay=800ms, maxDelay=8s, jitterRatio=0.2
  - 데이터 마이그레이션 없음

## 리스크/롤백
- 주요 리스크:
  - retry 설정값 과튜닝 시 재시도 지연 증가 또는 과도한 재시도
  - Transfers UI 최적화에서 이벤트 핸들링 회귀 가능성
- 롤백 방법:
  - 애플리케이션: 이전 이미지/커밋으로 롤백
  - 설정: `RCLONE_RETRY_*`를 기존값으로 복원
  - 프론트: `aad933d` 이전으로 되돌리면 기존 렌더 방식 복원

## 배포 메모
- 릴리즈 순서:
  - 1) 백엔드/차트 반영
  - 2) 프론트엔드 반영
  - 3) 모니터링 대시보드에서 retry/failure 지표 확인
- 모니터링 포인트:
  - retry pressure(%), final failure ratio(%), retry effectiveness
  - Transfers drawer 상호작용 지연/프레임 드랍 여부

## 이번 배치 커밋
- `5812e6a` feat(jobs): add configurable retry jitter for rclone retries
- `8418d7a` chore(deploy): expose rclone retry tuning env in samples and chart
- `fadb598` docs(roadmap): sync completed reliability and UX milestones
- `0c6a2e9` chore(gitlab): add roadmap delivery MR template
- `aad933d` perf(transfers): reduce drawer rerenders and sync roadmap
