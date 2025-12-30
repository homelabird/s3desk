# 분기 마일스톤: M6 + M7

## 개요
- 이름: M6+M7 (안정성/복구 + 관측성/성능)
- 기간: (예: 2025-Q1)
- 담당: (TBD)
- 목표/효과:
  - Job 내구성과 복구, 로그 정책, 실패 분류를 정리
  - 관측성/성능 기준을 정의하고 자동 검증 기반 마련

## 범위
- 포함:
  - M6: Job 영속성/재시작 복구, 취소/재시도 정책
  - M6: 로그 보존/정리 정책
  - M6: 실패 유형 분류
  - M7: 헬스체크/메트릭/구조화 로그
  - M7: 성능 기준 정의 및 측정 자동화
- 제외:
  - 원격/팀 범위 기능 구현(결정 별도)

## 성공 기준 (DoD)
- [ ] M6 이슈 3개 완료
- [ ] 관측성 지표/헬스체크 구현
- [ ] 성능 기준선 측정 및 회귀 체크 추가
- [ ] 문서/운영 가이드 업데이트

## 주요 리스크
- Job 재시작 복구 구현 난이도
- rclone 로그 파싱/분류 안정성

## 의존성
- DB 스키마/마이그레이션 정책
- 로그 구조 표준화

## 롤아웃/롤백
- 단계적 활성화 플래그
- 설정값으로 정책 전환 가능

## 메트릭
- Job 복구 성공률
- 실패 유형 분류율
- UI 성능 기준 충족 여부

## 관련 이슈
- docs/roadmap/issues/m6-job-durability-recovery.md
- docs/roadmap/issues/m6-job-log-retention.md
- docs/roadmap/issues/m6-job-failure-taxonomy.md
- docs/roadmap/issues/decision-remote-team-scope.md
