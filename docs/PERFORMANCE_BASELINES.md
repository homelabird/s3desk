# Performance baselines

This document defines UI performance budgets and how to measure them.

## Baseline budgets (local)

- App initial load: <= 2s
- Objects list first render (200 rows): <= 3s
- Jobs list first render (200 rows): <= 2s
- Jobs log drawer open: <= 1s
- Search/filter interaction: <= 300ms for visible update

## Automated measurement (opt-in)

Performance checks are opt-in to avoid flaky CI on slow runners.

- CI에서 실행하려면 `PERF_TESTS=1` 변수를 설정합니다.

- Jobs list render (mocked data):
  ```bash
  cd frontend
  PERF_TESTS=1 npx playwright test tests/jobs-perf.spec.ts
  ```
- Jobs log drawer open (mocked data):
  ```bash
  cd frontend
  PERF_TESTS=1 npx playwright test tests/jobs-perf.spec.ts
  ```
- Objects list render (mocked data):
  ```bash
  cd frontend
  PERF_TESTS=1 npx playwright test tests/jobs-perf.spec.ts
  ```

You can override the base URL with `PLAYWRIGHT_BASE_URL`.
