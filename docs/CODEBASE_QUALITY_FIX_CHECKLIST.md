# S3Desk Codebase Quality Fix Checklist (TARGET 85)
- 문서ID: `TASKPLAN-2026-03-18-T85`
- 작성일: `2026-03-18`
- 기준 문서: [CODEBASE_QUALITY_85POINT_ACTION_PLAN](/home/homelab/Downloads/project/s3desk/docs/CODEBASE_QUALITY_85POINT_ACTION_PLAN.md)
- 상태: `TASK CHECKLIST (세부 실행안)`

## 공통 수락 기준 (모든 TASK 공통)

- [ ] Evidence file:line이 문서에 등록됨
- [ ] Acceptance Criteria가 실행 가능하게 정의됨
- [ ] 변경 파일 단위 테스트 또는 회귀 테스트 계획이 존재
- [ ] 롤백/비상 대응이 문서화됨
- [ ] 릴리스 노트 반영 대상이 지정됨
- [ ] PR 단위로 작업이 분리되어 있으며, 각 TASK는 한 PR에 1~3개 이하 묶음
- [ ] 각 TASK 완료 시 증빙 라인은 `[파일 경로:시작-끝 라인]` 형식으로 기록

## TASK-001: API 토큰 쿼리 경로 폐기

파일: [backend/internal/api/middleware.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware.go)
증빙 템플릿: [backend/internal/api/middleware.go:LINE-START:LINE-END]

- [ ] 1) 인증 토큰 추출 지점을 `extractAPIToken` 또는 동일 책임 함수로 분리하고 `r.URL.Query().Get("apiToken")`를 제거
- [ ] 2) 허용 입력을 `Authorization` / `X-API-Token` / 쿠키(필요 시)로 제한
- [ ] 3) 쿼리 문자열에 토큰이 감지되면 즉시 오류 반환(401 권장, 에러 코드 표준화)
- [ ] 4) 감사 로그에 `apiToken_source: query_blocked` 필드 추가
- [ ] 5) 기존 동작 회귀 위험 확인: 헤더·쿠키 토큰으로 기존 기능이 동일하게 동작하는지 유지

검증:
- [ ] 인증 미들웨어 단위 테스트를 실행할 수 있는 상태로 구성
- [ ] 검증 명령: `go test ./backend/internal/api -run Test.*Token` (해당 패키지 범위)
- [ ] 실패 시 롤백: 쿼리 토큰 경로를 일시적으로 허용하는 브랜치 핫픽스 경로 제거하지 않고 되돌리기

## TASK-002: API 토큰 테스트 정비

파일: [backend/internal/api/middleware_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware_test.go)
증빙 템플릿: [backend/internal/api/middleware_test.go:LINE-START:LINE-END]

- [ ] 1) `query token` 케이스를 성공 케이스에서 제거
- [ ] 2) `query token` 노출 시 실패(assert 401/400) 테스트 추가
- [ ] 3) `Authorization` 정상 토큰/무효 토큰 테스트 1개씩 추가 또는 정합
- [ ] 4) 테스트 이름을 정책 기준으로 통일(`TestAPIAuthRejectsQueryToken`, `TestAPIAuthAcceptsHeaderToken`)

검증:
- [ ] 모든 API 인증 관련 테스트 실행 가능
- [ ] 테스트 코드에서 민감 정보 하드코딩 미존재

## TASK-003: manager 종료 로직 안전 종료 정책 적용

파일: [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)
증빙 템플릿: [backend/internal/jobs/manager.go:LINE-START:LINE-END]

- [ ] 1) 종료 직전 대상 존재/상태 검증 단계 추가 (`pid > 0`, `pid != self`, 프로세스 존재 여부)
- [ ] 2) `SIGKILL` 즉시 호출을 제거하고 `SIGTERM` 선행 플로우 적용
- [ ] 3) 타임아웃(예: 3~5초) 후 실패 시에만 `SIGKILL` 폴백
- [ ] 4) 종료 결과(`requested`, `graceful`, `force_killed`, `failed`)를 구조화 로그로 남김
- [ ] 5) 이미 종료되었거나 권한 없는 대상이면 `SIGKILL` 호출을 막는 가드 강화

검증:
- [ ] 종료 경로에 대한 실패/성공 이벤트 로그 템플릿 정의
- [ ] 테스트 명령: `go test ./backend/internal/jobs -run 'Test.*(Cancel|Kill|Terminate)'`

## TASK-004: rclone 취소 경로 종료 정책 정렬

파일: [backend/internal/jobs/rclone_attempt.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_attempt.go)
증빙 템플릿: [backend/internal/jobs/rclone_attempt.go:LINE-START:LINE-END]

- [ ] 1) rclone 취소 루틴에서 강제 종료 직전 대상 식별·검증 로직 추가
- [ ] 2) manager와 동일한 종료 정책 인터페이스 호출 경로로 전환
- [ ] 3) 취소 중복 호출 방지 플래그가 있는지 확인 후 멱등성 보장
- [ ] 4) 취소 실패 시 사용자에게 일관된 에러 메시지와 상태 전이 적용

검증:
- [ ] 취소 후 `no-op` 중복 호출 시 리턴 코드/상태가 안정적으로 유지되는지 확인
- [ ] 테스트 명령: `go test ./backend/internal/jobs -run Test.*Rclone.*Cancel`

## TASK-005: 공통 프로세스 종료 유틸 신설

파일: [backend/internal/jobs/process_kill.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/process_kill.go)
증빙 템플릿: [backend/internal/jobs/process_kill.go:LINE-START:LINE-END]

- [ ] 1) 종료 정책 타입 및 결과 타입 정의(`KillResult`, `KillPolicy`)
- [ ] 2) `CanTerminate`, `TryTerminate`, `ForceTerminate`, `IsSelfPID` 유틸 작성
- [ ] 3) 실패 사유를 구분하는 에러 래퍼 적용(권한, 없음, 타임아웃, 재시도필요)
- [ ] 4) 기존 `manager.go`와 `rclone_attempt.go`에서 동일 유틸 호출되도록 의존성 연결

검증:
- [ ] 유틸 단독 테스트 코드 포맷과 문서 주석 추가
- [ ] 정적 분석에서 `deadcode`/미사용 경고 없는지 확인

## TASK-006: 종료 유틸 회귀 테스트 작성

파일: [backend/internal/jobs/process_kill_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/process_kill_test.go)
증빙 템플릿: [backend/internal/jobs/process_kill_test.go:LINE-START:LINE-END]

- [ ] 1) no-op 케이스(이미 종료된 pid) 테스트
- [ ] 2) 자기 자신 pid 차단 테스트
- [ ] 3) 유효하지 않은 pid/재사용 pid 차단 테스트
- [ ] 4) `SIGTERM` 타임아웃 후 `SIGKILL` 폴백 테스트
- [ ] 5) 안전성 테스트: 무관 프로세스에 신호 미전달 검증

검증:
- [ ] 테스트 실패 원인별 subtest 분리
- [ ] 실패 시 로그/오류 메시지가 정책 판단에 사용될 수 있게 유지

## TASK-007: rclone_tls 위험 설정 경로 정리

파일: [backend/internal/jobs/rclone_tls.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_tls.go)
증빙 템플릿: [backend/internal/jobs/rclone_tls.go:LINE-START:LINE-END]

- [ ] 1) `InsecureSkipVerify` 설정 시 경고 또는 승인 플래그 조건 강제
- [ ] 2) 운영 모드(`prod`)에서 기본 차단 규칙 적용 검토
- [ ] 3) 예외 허용 시 운영자 메시지/감사 로그 구조화
- [ ] 4) 설정 문서에서 위험 정책 변경 이력 링크 추가

검증:
- [ ] `InsecureSkipVerify=true` 단독 케이스로 정책 미준수 시 동작 점검
- [ ] 테스트 명령: `go test ./backend/internal/jobs -run 'Test.*(TLS|Insecure)'`

## TASK-008: profiletls 구성 정책 강화

파일: [backend/internal/profiletls/config.go](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go)
증빙 템플릿: [backend/internal/profiletls/config.go:LINE-START:LINE-END]

- [ ] 1) 설정 로더에서 `SkipVerify` 기본값을 안전값으로 강제
- [ ] 2) 프로필 저장/수정 API에서 승인 플래그 또는 운영 모드 예외 조건 검증
- [ ] 3) 위험 설정 반영 시 경고 메시지 및 변경 이력 로깅 연결
- [ ] 4) 사용자/시스템 환경 변수로 우회되지 않도록 입력 정규화 및 화이트리스트 적용

검증:
- [ ] 위험 값 변경 시 최소 1건의 감사 이벤트가 남는지 확인
- [ ] 운영/개발 모드 분기 테스트 케이스 정합성 확인

## TASK-009: LinkButton 접근성 구현 정밀 수정

파일: [frontend/src/components/LinkButton.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/components/LinkButton.tsx)
증빙 템플릿: [frontend/src/components/LinkButton.tsx:LINE-START:LINE-END]

- [ ] 1) disabled 렌더링 시 `div/span` 같은 비시맨틱 링크를 제거
- [ ] 2) 실제 의도가 링크면 `<a>` + `aria-disabled` 또는 버튼이 필요하면 `<button>`로 분기
- [ ] 3) 키보드 포커스 처리와 `onClick` 차단 정책을 명확화
- [ ] 4) 스타일 변경 없는 상태에서 테스트 ID/클래스명 유지 검토
- [ ] 5) 접근성 lint 규칙 추가가 가능한지 사전 검토(`jsx-a11y` 활성화 여부 점검)

검증:
- [ ] 정적 스캔: `npm run lint` 또는 프론트 정적 검사 실행 범위
- [ ] 수동 확인: 비활성 상태에서 Enter/Space 동작 유효성 검토

## TASK-010: CI 품질 게이트 강화

파일: [.gitlab-ci.yml](/home/homelab/Downloads/project/s3desk/.gitlab-ci.yml)
증빙 템플릿: [.gitlab-ci.yml:LINE-START:LINE-END]

- [ ] 1) shellcheck를 필수 단계로 추가하고 실패 시 전체 파이프라인 실패 처리
- [ ] 2) golangci-lint 실행 대상 및 설정 경로 명시(구성 파일 유실시 경고 실패)
- [ ] 3) 테스트 커버리지 또는 핵심 패키지 커버리지 임계치 규칙 추가
- [ ] 4) 실패 로그 수집 규칙을 규격화(artifact/로그 경로)
- [ ] 5) 게이트 문구를 릴리스 게이트 문서와 동기화

검증:
- [ ] PR에서 CI 설정 변경만으로 게이트가 강화되는지 dry-run 검증
- [ ] 최소 1회 실패 시나리오로 규칙이 실제로 실패 처리되는지 확인

## 실행 순서(권장)

- 1차: TASK-001, TASK-002, TASK-003
- 2차: TASK-004, TASK-005, TASK-006
- 3차: TASK-007, TASK-008
- 4차: TASK-009, TASK-010

## 완료 조건

- [ ] TASK-001 ~ TASK-010 전 항목 완료
- [ ] 각 TASK 증빙 라인 및 테스트 결과 연결
- [ ] 점수 반영: 79.0 → 85.0 목표 달성 문서 업데이트
- [ ] 배포 전 릴리스 게이트 통과 확인

## 변경 이력

- [ ] 미완료
