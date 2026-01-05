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

- rclone 에러 메시지 → 코드 매핑 (`rclone_helpers.go`의 패턴 사용)
- 내부 Job 실패 시 에러 메시지에 `error_code` 포함
- Job 완료 이벤트 및 로그에 `error_code` 필드 포함

## 대시보드 계획

- 실패 비율(전체): `sum(rate(jobs_completed_total{status="failed"}[5m])) / sum(rate(jobs_completed_total[5m]))`
- 상위 실패 코드 Top-N: `topk(5, sum(rate(jobs_completed_total{status="failed"}[15m])) by (error_code))`
- 코드별 평균 Job duration: `sum(rate(jobs_duration_ms_sum{status="failed"}[15m])) by (error_code) / sum(rate(jobs_duration_ms_count{status="failed"}[15m])) by (error_code)`
- unknown 비율: `sum(rate(jobs_completed_total{status="failed",error_code="unknown"}[15m])) / sum(rate(jobs_completed_total{status="failed"}[15m]))`
- 재시도 비율: `jobs_retried_total` 대비 실패 코드

> 참고: `jobs_completed_total`/`jobs_duration_ms`의 `error_code` 라벨은 실패가 아닌 상태에서는 `none`으로 기록된다.

## 참고

- `docs/OBSERVABILITY.md`
- `docs/LOGGING_PIPELINE.md`
