# 분기 마일스톤: M8 + M9

## 개요
- 이름: M8+M9 (보안/운영 표준화 + 원격/팀 지원)
- 기간: (예: 2025-Q2~Q3)
- 담당: (TBD)
- 목표/효과:
  - 운영 표준/헬스체크/백업 체계를 확정
  - 원격/팀 운영을 위한 권한/감사/공유 기반 마련
  - 즐겨찾기/북마크 MVP 및 팀 공유까지 확장

## 범위
- 포함:
  - M8: 보안/운영 정책, Runbook, 백업/복구, healthz/readyz
  - M8: 즐겨찾기/북마크 MVP(단일 사용자)
  - M9: 인증/권한/RBAC/감사 로그
  - M9: 팀/프로젝트 스코프 및 공유 정책
  - M9: 팀 공유 즐겨찾기/북마크
- 제외:
  - 엔터프라이즈 확장 기능(M10)
  - 교차 인스턴스 동기화

## 성공 기준 (DoD)
- [ ] M8 이슈 완료
- [ ] 백업/복구 리허설 1회 이상 성공
- [ ] 헬스체크/알람 기준 문서화 및 적용
- [ ] 즐겨찾기/북마크 MVP 제공 및 기본 지표 수집
- [ ] M9 인증/권한/RBAC/감사 로그 기반 확정
- [ ] 팀 공유 즐겨찾기/북마크 제공

## 주요 리스크
- 권한 모델과 공유 정책의 범위 확대
- 운영 표준화 문서와 실제 운영 간 괴리

## 의존성
- 인증/권한 설계 결정
- 로그/메트릭 파이프라인 안정화

## 롤아웃/롤백
- 기능 플래그로 단계적 활성화
- 공유 기능 비활성화 시 개인 즐겨찾기 유지

## 메트릭
- 토큰 회전/백업/복구 성공률
- 즐겨찾기/북마크 재사용률
- 팀 공유 항목 접근 성공/실패율

## 관련 이슈
- docs/roadmap/issues/m8-security-ops-hardening.md
- docs/roadmap/issues/m8-backup-restore.md
- docs/roadmap/issues/m8-health-readiness.md
- docs/roadmap/issues/m8-favorites-bookmarks-mvp.md
- docs/roadmap/issues/m9-remote-team-access.md
- docs/roadmap/issues/m9-remote-team-rbac.md
- docs/roadmap/issues/m9-favorites-sharing.md
- docs/roadmap/issues/decision-remote-team-scope.md
