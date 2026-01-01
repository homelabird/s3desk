## 요약
healthz/readyz 분리와 운영 알람 기준을 정의한다.

## 배경/문제
현재 healthz 기준만 존재해 DB/스토리지 등 의존성 상태를 분리하기 어렵다.

## 목표
- healthz/readyz 역할 분리
- 운영 알람 기준/임계값 정리

## 범위
- 포함:
  - healthz: 프로세스/기본 상태
  - readyz: DB/스토리지 의존성 상태
  - 알람 기준(지연/오류율)
- 제외:
  - 외부 APM 연동

## 수용 기준 (Acceptance Criteria)
- [x] healthz/readyz 정의 문서화
- [x] 알람 기준/임계값 합의 및 문서화

## 리스크/가정
- 스토리지 상태 체크 비용/지연 고려

## 의존성
- 관측성 메트릭 정의

## 테스트/검증
- 의도적 장애 주입 시 상태 전환 검증

## 롤아웃/롤백
- 점진적 적용(문서 → 구현 → 운영)

## 메트릭
- readyz 실패율
- readyz 체크 지연

## 알람 기준/임계값 (초안)
- readyz 실패율: `rate(http_requests_total{route="/readyz",status="503"}[5m]) / rate(http_requests_total{route="/readyz"}[5m]) > 0.1` (5분) → 경고
- HTTP 5xx 비율: `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01` (10분) → 경고
- Job 실패 비율: `sum(rate(jobs_completed_total{status="failed"}[15m])) / sum(rate(jobs_completed_total[15m])) > 0.05` (15분) → 경고
- Queue 포화: `jobs_queue_depth / jobs_queue_capacity > 0.8` (10분) → 경고
- 이벤트 재연결 급증: `rate(events_reconnects_total[5m]) > 5` → 경고

## 참고 링크
- docs/production-roadmap.md
- docs/OBSERVABILITY.md
