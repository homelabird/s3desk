# S3Desk 코드베이스 품질 79점 → 85점대 목표 액션 플랜

- 작성일: `2026-03-18`
- 기준: 현재 79점 분석 점수
- 목표: `85점대` 회복(총 `+6.0`p)
- 범위: backend, frontend, CI 전체 영향도 높은 10개 항목
- 검증: 각 항목에 증빙 이슈/라인, 작업량, 기대 상승치 등록

## 목표 점수 모델

- 총목표: `79.0 → 85.0`
- 요구 상승치: `+6.0`p
- 산출 방식: 항목별 위험도(보안/안정성/운영) 가중치 반영 + 구현 난이도 대비 기대 점수 상승
- 기준: 파일 단위 라인 근거 기반 반영

## 10개 액션 플랜 (즉시 실행 안건)

1. [backend/internal/api/middleware.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware.go)  
   - 작업: `apiToken` 쿼리 파라미터 경로 제거/차단(헤더·쿠키만 인증 허용)  
   - 예상 작업량: `M` (약 2h)  
   - 기대 점수 상승: `+1.3`  
   - 우선순위: `P1`

2. [backend/internal/api/middleware_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/api/middleware_test.go)  
   - 작업: 인증 테스트를 헤더 우선 정책으로 정렬하고 query token 허용 테스트를 실패 케이스로 전환  
   - 예상 작업량: `S` (약 1h)  
   - 기대 점수 상승: `+0.3`  
   - 우선순위: `P1`

3. [backend/internal/jobs/manager.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/manager.go)  
   - 작업: `syscall.Kill(-pid, SIGKILL)` 기반 즉시 강제 종료를 종료 정책 기반 플로우로 교체(상태 점검 + `SIGTERM` 우선)  
   - 예상 작업량: `M` (약 3~4h)  
   - 기대 점수 상승: `+0.8`  
   - 우선순위: `P1`

4. [backend/internal/jobs/rclone_attempt.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_attempt.go)  
   - 작업: rclone 취소 경로 종료 처리도 동일한 종료 정책으로 통일  
   - 예상 작업량: `S` (약 1~2h)  
   - 기대 점수 상승: `+0.5`  
   - 우선순위: `P1`

5. [backend/internal/jobs/process_kill.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/process_kill.go) (신규)  
   - 작업: 프로세스 종료 유틸을 공통 모듈화해 pid/pgid 검증·로그·fallback timeout 정책 중앙화  
   - 예상 작업량: `M` (약 2h)  
   - 기대 점수 상승: `+0.4`  
   - 우선순위: `P2`

6. [backend/internal/jobs/process_kill_test.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/process_kill_test.go) (신규)  
   - 작업: 위 종료 유틸 단위 테스트 추가(무효 pid, 자가 종료 방지, no-op 케이스, 타임아웃 폴백)  
   - 예상 작업량: `M` (약 2h)  
   - 기대 점수 상승: `+0.4`  
   - 우선순위: `P2`

7. [backend/internal/jobs/rclone_tls.go](/home/homelab/Downloads/project/s3desk/backend/internal/jobs/rclone_tls.go)  
   - 작업: TLS `InsecureSkipVerify` 사용 시 정책 가드, 운영 차단/경고, 감사 로깅 강화  
   - 예상 작업량: `M` (약 2h)  
   - 기대 점수 상승: `+0.8`  
   - 우선순위: `P1`

8. [backend/internal/profiletls/config.go](/home/homelab/Downloads/project/s3desk/backend/internal/profiletls/config.go)  
   - 작업: 위험 플래그 기본값 및 예외 경로 정합성 정리(개발/운영 환경 정책 분기 강화)  
   - 예상 작업량: `M` (약 2h)  
   - 기대 점수 상승: `+0.4`  
   - 우선순위: `P2`

9. [frontend/src/components/LinkButton.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/components/LinkButton.tsx)  
   - 작업: disabled state 링크 렌더링 비시맨틱 구현 제거, 접근성 기준 충족 UI 상태로 전환  
   - 예상 작업량: `S` (약 1h)  
   - 기대 점수 상승: `+0.3`  
   - 우선순위: `P3`

10. [.gitlab-ci.yml](/home/homelab/Downloads/project/s3desk/.gitlab-ci.yml)  
    - 작업: shellcheck/golangci-lint/coverage 실패 게이트를 명시적으로 추가해 배포 직전 품질 문턱 강화  
    - 예상 작업량: `M` (약 3h)  
    - 기대 점수 상승: `+0.6`  
    - 우선순위: `P2`

## 실행 우선순위 정렬

- 1차(즉시): 1, 3, 4, 7, 9
- 2차(빠른 보강): 2, 5, 6, 8
- 3차(장기 유지): 10

## 기대 최종 점수

- 현재 점수: `79.0`
- 항목 합계 상승치: `+6.0`
- 목표 점수: `85.0`

## 리스크 및 가정

- 신규 프로세스 종료 유틸 도입 시 플랫폼별(`linux/darwin`) 분기 테스트 필요
- CI 가드 강화는 초기 CI 통과 시간 증가 가능성 있음(목표는 품질 신뢰성 우선)
- frontend 링크 접근성 수정은 UX 변경 최소화(시각 스타일 유지 범위 내)로 반영
