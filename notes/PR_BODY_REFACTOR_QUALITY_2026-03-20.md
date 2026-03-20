## Summary

- 데모 스택 호스트/원격 접근 기본값 정리
- 백엔드 `jobs`/`store` 내부 책임 분리
- 프런트 API client를 domain/sub-facade 구조로 분리
- `Objects` 페이지 스타일/플로우 분리
- `BucketPolicyModal`, `BucketModal`, profile modal section 분리
- 모바일 반응형 E2E와 로컬 smoke/full gate 추가
- 리팩터링/품질 계획 문서와 후속 이슈 초안 추가

## Validation

- `./scripts/check.sh full`

## Review order

1. Demo/environment defaults
2. Backend `jobs` / `store`
3. Frontend API client
4. `Objects`
5. `Buckets` / `Profiles`
6. Test and quality-gate changes
7. Notes/docs

## Main risk areas

- API facade wiring regression
- `Objects` CSS ownership 변경에 따른 레이아웃 edge case
- bucket/profile modal save/reset flow 회귀
- 새 `full` gate 기준의 backend static analysis 영향
