# Failure taxonomy

## 목적

Job 실패 원인을 코드로 분류해 UI/로그/메트릭에서 동일한 기준으로 집계한다.

## 분류 코드 (초안)

### 인증/권한
- `invalid_credentials`: 인증 정보가 잘못됨
- `access_denied`: 권한 부족
- `signature_mismatch`: 서명 불일치
- `request_time_skewed`: 요청 시간 오류

### 네트워크/엔드포인트
- `endpoint_unreachable`: 엔드포인트 연결 실패
- `upstream_timeout`: 상위 시스템 타임아웃
- `network_error`: 기타 네트워크 오류

### 환경/의존성
- `transfer_engine_missing`: rclone 미설치/경로 불가 (PATH 또는 RCLONE_PATH)
- `transfer_engine_incompatible`: rclone 버전이 너무 낮아 필요한 플래그를 지원하지 않음

### 리소스/대상
- `not_found`: 버킷/오브젝트 없음
- `conflict`: 동시성/상태 충돌
- `rate_limited`: 과도한 요청/큐 초과

### 작업 흐름
- `canceled`: 사용자 취소
- `server_restarted`: 서버 재시작으로 실패 처리
- `validation_error`: 요청/페이로드 검증 실패
- `unknown`: 분류 불가

## 적용 지점

- API 오류 응답에서 `normalizedError.code=rate_limited`인 경우, HTTP 헤더 `Retry-After`를 함께 반환해
  클라이언트/자동화가 백오프(backoff) 기준을 잡을 수 있게 한다.

- Jobs(비동기)에서 rclone 실행이 `normalizedError.retryable=true`로 분류되면 자동으로 exponential backoff 재시도한다.
  - 기본 retry 대상: `rate_limited` / `endpoint_unreachable` / `upstream_timeout` / `network_error`
  - 환경 변수: `RCLONE_RETRY_ATTEMPTS`, `RCLONE_RETRY_BASE_DELAY`, `RCLONE_RETRY_MAX_DELAY`, `RCLONE_RETRY_JITTER_RATIO`
  - 기본값: `3`, `800ms`, `8s`, `0.2`
  - duration 포맷: Go duration string (예: `800ms`, `2s`, `30s`)

- (옵션) unknown rclone stderr 샘플을 저장해 패턴을 확장한다.
  - 환경 변수: `RCLONE_CAPTURE_UNKNOWN_ERRORS=true`
  - 저장 경로: `${DATA_DIR}/logs/rcloneerrors/unknown/*.txt`

- rclone 에러 메시지 → 코드 매핑 (`backend/internal/rcloneerrors` 공통 모듈 사용)
- API 오류 응답: `ErrorResponse.error.normalizedError` (provider-agnostic 공통 코드)
- 내부 Job 실패 시 에러 메시지/DB에 `error_code` 포함 (동일한 분류 로직 사용)
- Job 완료 이벤트 및 로그에 `error_code` 필드 포함

## 대시보드 계획

- 실패 비율(전체): `100 * sum(rate(jobs_completed_total{status="failed"}[15m])) / clamp_min(sum(rate(jobs_completed_total[15m])), 0.001)`
- 실패 비율(type별): `100 * sum(rate(jobs_completed_total{status="failed"}[15m])) by (type) / clamp_min(sum(rate(jobs_completed_total[15m])) by (type), 0.001)`
- 상위 실패 코드 Top-N: `topk(5, sum(rate(jobs_completed_total{status="failed"}[15m])) by (error_code))`
- 코드별 평균 Job duration: `sum(rate(jobs_duration_ms_sum{status="failed"}[15m])) by (error_code) / sum(rate(jobs_duration_ms_count{status="failed"}[15m])) by (error_code)`
- unknown 비율: `100 * sum(rate(jobs_completed_total{status="failed",error_code="unknown"}[15m])) / clamp_min(sum(rate(jobs_completed_total{status="failed"}[15m])), 0.001)`
- 재시도 시도량(type별): `sum(rate(jobs_retried_total[15m])) by (type)`
- 재시도 압력(%): `100 * sum(rate(jobs_retried_total[15m])) / clamp_min(sum(rate(jobs_started_total[15m])), 0.001)`
- 재시도 효과지표(재시도/최종실패): `sum(rate(jobs_retried_total[15m])) / clamp_min(sum(rate(jobs_completed_total{status="failed"}[15m])), 0.001)`

> 참고: `jobs_completed_total`/`jobs_duration_ms`의 `error_code` 라벨은 실패가 아닌 상태에서는 `none`으로 기록된다.

## 참고

- `docs/OBSERVABILITY.md`
- `docs/LOGGING_PIPELINE.md`
