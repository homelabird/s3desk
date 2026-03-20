# Next Action Checklist

Date: `2026-03-20`

## Immediate

- [ ] 새 기능 작업 전, 현재 안정 구간을 다시 열지 않아도 되는지 먼저 확인
- [ ] 반복 개발 중에는 `./scripts/check.sh fast` 사용
- [ ] 머지 전에는 `./scripts/check.sh full` 사용
- [ ] 새 작은 hook/component 테스트를 추가할 때는 [`mockApiClient.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/test/mockApiClient.ts) 우선 사용

## Next refactor only if needed

- [ ] [`clientSubFacades.ts`](/home/homelab/Downloads/project/s3desk/frontend/src/api/clientSubFacades.ts) line 수나 review churn이 커질 때만 family split 재검토
- [ ] [`manager_transfer_execution.go`](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager_transfer_execution.go)에 새 transfer family가 추가될 때만 분리 재검토
- [ ] bucket create flow에 새 provider/default 규칙이 늘어날 때만 [`BucketModal.tsx`](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx) 후속 리팩터링 재개

## Product-change guardrails

- [ ] 아래 stable zone은 실제 기능 압력이나 회귀가 없으면 건드리지 않기
- [ ] stable zone 기준은 [`STABLE_ZONES_2026-03-20.md`](/home/homelab/Downloads/project/s3desk/notes/STABLE_ZONES_2026-03-20.md) 참고
- [ ] 전체 상태 요약은 [`CODEBASE_REFACTOR_QUALITY_SUMMARY_2026-03-20.md`](/home/homelab/Downloads/project/s3desk/notes/CODEBASE_REFACTOR_QUALITY_SUMMARY_2026-03-20.md) 참고

## Optional cleanup

- [ ] notes 문서가 더 늘어나면 [`INDEX.md`](/home/homelab/Downloads/project/s3desk/notes/INDEX.md) 기준으로 링크 유지
- [ ] 새 테스트에서 sub-facade mock이 반복되기 시작하면 `mockApiClient`로 먼저 흡수
- [ ] 새 리팩터링을 시작할 때는 먼저 backlog 상태를 [`CODEBASE_IMPROVEMENT_BACKLOG_2026-03-19.md`](/home/homelab/Downloads/project/s3desk/notes/CODEBASE_IMPROVEMENT_BACKLOG_2026-03-19.md)에 반영

## Recommended current default

- [ ] 당분간은 구조 리팩터링보다 실제 제품 기능 작업 우선
