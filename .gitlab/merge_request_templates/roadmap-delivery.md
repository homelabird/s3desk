## 요약
- 무엇을/왜 변경했는지 2~3줄로 작성

## 관련 항목
- Roadmap:
- Issue:
- API/스펙:

## 변경 범위
- 포함:
- 제외:

## 핵심 변경점
- 백엔드:
- 프론트엔드(UI/UX):
- 배포/인프라:
- 문서:

## 검증 체크리스트
- [ ] 단위/통합 테스트 통과
- [ ] `go test ./internal/jobs -run RcloneRetryDelay -count=1`
- [ ] `helm lint charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml`
- [ ] `helm template s3desk charts/s3desk -f charts/s3desk/values.yaml -f charts/s3desk/ci-values.yaml >/tmp/s3desk-render.yaml`
- [ ] `docker compose -f docker-compose.yml config`
- [ ] `docker compose -f docker-compose.postgres.yml config`
- [ ] `docker compose -f docker-compose.e2e.yml config`
- [ ] 변경된 설정/환경변수 문서화 완료

## 사용자 영향
- Breaking change 여부:
- 운영자 액션 필요 여부:
- 기본값/마이그레이션:

## 리스크/롤백
- 주요 리스크:
- 롤백 방법:

## 배포 메모
- 릴리즈 순서:
- 모니터링 포인트:

## 이번 배치 커밋(필요 시 교체)
- `5812e6a` feat(jobs): add configurable retry jitter for rclone retries
- `8418d7a` chore(deploy): expose rclone retry tuning env in samples and chart
- `fadb598` docs(roadmap): sync completed reliability and UX milestones
