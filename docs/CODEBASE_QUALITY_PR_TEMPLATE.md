# PR Template: S3Desk Quality Task Delivery (TASK-xxx)

## PR 제목

- `fix(quality): TASKPLAN-2026-03-18 - P1~P3 fix items`

## 요약

- 변경 개요:
  - [ ] 요약 1
  - [ ] 요약 2
- 대상 문서:
  - [CODEBASE_QUALITY_REPORT](/home/homelab/Downloads/project/s3desk/docs/CODEBASE_QUALITY_REPORT.md)
  - [CODEBASE_QUALITY_FIX_CHECKLIST](/home/homelab/Downloads/project/s3desk/docs/CODEBASE_QUALITY_FIX_CHECKLIST.md)

## 작업 항목 (Task Mapping)

- [ ] TASK- ID: `TASK-P1-001`
  - 파일:
    - [backend/internal/api/middleware.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware.go:179)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P1-002`
  - 파일:
    - [backend/internal/api/middleware.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware.go:147)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P1-003`
  - 파일:
    - [backend/internal/api/middleware_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware_test.go:352)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P2-001`
  - 파일:
    - [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:619)
    - [backend/internal/jobs/rclone_attempt.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_attempt.go:71)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P2-002`
  - 파일:
    - [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:619)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P2-003`
  - 파일:
    - [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:619)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P2-004`
  - 파일:
    - [backend/internal/jobs/rclone_attempt.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_attempt.go:71)
    - [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go:619)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P3-001`
  - 파일:
    - [backend/internal/profiletls/config.go](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go:20)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P3-002`
  - 파일:
    - [backend/internal/api/handlers_profiles.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_profiles.go:501)
  - 변경 내역:
  - 수락 기준 반영 여부:

- [ ] TASK- ID: `TASK-P3-003`
  - 파일:
    - [backend/internal/api/handlers_profile_tls_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/handlers_profile_tls_test.go:177)
  - 변경 내역:
  - 수락 기준 반영 여부:

## 보안/안전성 체크

- [ ] 쿼리 토큰(`apiToken`)은 인증 입력으로 더 이상 허용되지 않음
- [ ] 종료 동작은 검증 후 안전 종료 경로 적용(`SIGTERM -> 대기 -> SIGKILL`)
- [ ] TLS Skip Verify는 승인/가드 조건 만족 시에만 적용

## 테스트/검증

- [ ] `go test` 실행 범위:
  - [ ] `./backend/internal/api/...`
  - [ ] `./backend/internal/jobs/...`
- [ ] 회귀 테스트 체크:
  - [ ] TASK-P1-001~003 수락 기준 검증
  - [ ] TASK-P2-001~004 수락 기준 검증
  - [ ] TASK-P3-001~003 수락 기준 검증
- [ ] 변경된 라인별 증빙 링크 포함 (file:line)

## 롤백 플랜

- [ ] 실패 시 롤백 대상 태스크/커밋 지정:
  - [ ] 롤백 커맨드/전술
  - [ ] 환경변수/플래그 되돌리기 절차
  - [ ] 안전 종료/인증 정책 역설정 절차

## 릴리스 반영

- [ ] 릴리스 메타 반영 필요: [CODEBASE_QUALITY_REPORT](/home/homelab/Downloads/project/s3desk/docs/CODEBASE_QUALITY_REPORT.md)
- [ ] 버전/릴리스 노트 반영 예정 섹션 링크:
- [ ] Known Limitation 항목 반영 여부:

---

# Code Review Checklist: TASK Plan Gate

## Reviewer 역할 체크

- [ ] `TASK-xxx` 식별자(필수) 모두 PR 본문에 표기되어 있음
- [ ] 각 TASK에 파일 라인 근거가 명시됨
- [ ] Acceptance Criteria가 누락 없이 대응됨
- [ ] DoR/DoD 조건이 실사용 가능한가?

## 보안 게이트

- [ ] `apiToken` 쿼리 지원 제거 여부: 코드 + 테스트 + 로그 3중 검증
- [ ] `InsecureSkipVerify` 예외가 정책 가드 하에서만 동작
- [ ] 프로세스 종료 경로에서 자기 자신/무관 프로세스 kill 방지 증빙

## 품질 게이트

- [ ] 공통 헬퍼/중복 제거로 인한 변경 정합성 확인
- [ ] 예외 처리 및 로그 구조(`event`, `source`, `task_id`) 정합성
- [ ] 실패 시 롤백 포인트가 명시되어 있음

## 승인 조건

- [ ] P1 관련 TASK 전부 완료
- [ ] P2 미완료 건수 0 또는 승인된 보류 사유 있음
- [ ] P3 항목은 운영 Owner 승인/주석 첨부
- [ ] 변경 이력(Completed by/Date/Evidence) 미기재 없음

## Merge Ready

- [ ] 위 모든 체크 완료
- [ ] 변경 내용이 문서 링크와 일치
- [ ] 최종 릴리스 노트 반영 준비 완료
