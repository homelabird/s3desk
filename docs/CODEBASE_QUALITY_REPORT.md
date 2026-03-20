# S3Desk Codebase Quality Report

- 작성일: 2026-03-18
- 대상: backend, frontend, scripts 핵심 코드 경로를 중심으로 라인 단위 정합성 기반 점검
- 범위: 보안/안정성/운영 품질 중심, 우선순위 정렬 포함

## 1) 총점

- **Overall Score: 84 / 100**

## 2) 채점 기준 요약

- 보안: 45점
- 안정성/운영 신뢰성: 30점
- 코드 품질/유지보수성: 25점

주요 감점 포인트:

- 인증 토큰 전달 경로에서 URL 쿼리 허용
- 프로세스 종료 시 과도한 PGID Kill 동작
- TLS 검증 비활성화 옵션이 쉽게 활성화되는 경로
- 일부 운영 스크립트의 보안 완화(`curl -k`) 존재(상위 3개 외)

---

## 3) 우선 순위 이슈 (상위 3개)

## P1 (High): API 토큰을 URL 쿼리로 수락

- 근거:
  - [backend/internal/api/middleware.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware.go:179)
  - [backend/internal/api/middleware_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware_test.go:352)
- 이슈:
  - `apiToken`을 `r.URL.Query().Get("apiToken")`로 수신하여 인증에 사용
  - URL 파라미터 기반 전달은 로그, 프록시, 브라우저 히스토리/참조자에서 노출될 수 있어 민감정보 유출 위험이 큼
- 영향도:
  - 인증 유출, 권한 남용, 감사 추적 오염
- 권고 패치:
  1. URL 쿼리 토큰 처리 제거 또는 강제 거부 처리
  2. 헤더(`Authorization`, `X-API-Token`) 기반 인증으로만 승인
  3. 쿼리 토큰 접근 차단에 대한 400/401 응답 추가
  4. 테스트 케이스를 헤더 기반 시나리오로 변경

---

## P2 (High): PGID 기반 강제 종료 동작 범위 과도

- 근거:
  - [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:619)
  - [backend/internal/jobs/rclone_attempt.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_attempt.go:71)
- 이슈:
  - `syscall.Kill(-pid, syscall.SIGKILL)` 호출은 프로세스 그룹 전체 종료 가능
  - 타깃 PGID/프로세스 생명주기 검증이 약하면 비의도적 종료 위험이 존재
- 영향도:
  - 작업 취소 시 비정상으로 연관 작업/하위 프로세스 종료, 장애 확대
- 권고 패치:
  1. 종료 대상의 pid/pgid 소유권 및 상태 검증 강화
  2. 종료 정책을 `SIGTERM` → 대기 → `SIGKILL` 순으로 단계화
  3. 이미 종료되었거나 재사용된 PID에 대한 보안성 검증 추가(권한·자식 관계 확인)
  4. 종료 이벤트를 감사 로그로 기록

---

## P3 (High): TLS 검증 무시 옵션의 위험 제어 미흡

- 근거:
  - [backend/internal/profiletls/config.go](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go:20)
- 이슈:
  - 프로필 값으로 `TLSInsecureSkipVerify`가 활성화되면 `cfg.InsecureSkipVerify = true`로 즉시 적용
  - 운영 오용 시 MITM 공격면 확대 가능
- 영향도:
  - 데이터 기밀성/무결성 침해 위험
- 권고 패치:
  1. 기본값을 `false`로 강제 유지(현재 구조 유지 전제)
  2. 운영 환경에서 활성화 시 명시적 승인 플래그 및 경고 메시지 요구
  3. 사용 이력 감사 로그 및 정책 검증 경로 추가
  4. 문서/운영 체크리스트에 위험 레벨 및 승인 기준 기재

---

## 4) 개선 우선순위 실행 계획 (짧은 버전)

1. P1 보안 수정(토큰 경로 폐기) → 즉시
2. P2 종료 동작 수정(안전 종료 정책) → 즉시
3. P3 TLS Skip 검증 강제 정책 도입 → 다음 배포 주기
4. P1~P3 회귀 테스트(인증 API, 작업 취소, 프로필 저장/복원)

## 5) 참고 사항

- 분석은 라인 근거 기반으로 수행되었으나, 모든 파일을 전수 열람하지는 않았고 정적 패턴 스캔을 보조적으로 수행함.
- 추가로 중점 점검한 항목은 아래와 같으나 상위 3개 이슈 대비 우선도는 낮음
  - 운영 스크립트의 `curl -k` 패턴(중간 위험)
  - 환경 변수 파싱 실패 시 기본값 폴백의 진단성 저하(중간 위험)
