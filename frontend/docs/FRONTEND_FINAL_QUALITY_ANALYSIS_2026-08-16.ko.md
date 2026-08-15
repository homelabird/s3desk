# S3Desk 최종 프론트엔드 품질 분석 및 개선 결과

날짜: 2026-08-16  
기준: `main` / `2b55aafdbf7cf3ee78da6f02f00b0c0d9fb73fb7`

## 최종 결론

현재 프론트엔드는 로컬 deterministic fixture와 Chromium 범위에서 기능, 구조, 접근성, 반응형, 시각 회귀, production build, bundle budget을 모두 통과했다. 분석에서 확인한 로컬 P1/P2 항목은 이번 개선으로 닫혔으며, 핵심 작업을 막는 P0 결함은 재현되지 않았다.

최종 가중 점수는 **9.1/10**이다.

- 기능·구조·접근성·반응형: **GO** — 로컬 fixture/Chromium 범위
- production build·bundle budget: **GO**
- 실제 Safari, Firefox 400% zoom, VoiceOver/TalkBack, 물리 기기, provider·배포·production: **미검증**

## 평가 범위

- Login/bootstrap
- Profiles
- Buckets와 provider별 policy/governance
- Objects의 tree/list/details/search/preview/overlay
- Uploads와 Transfers
- Jobs/Activity
- Settings drawer
- 공용 shell, navigation, dialog, sheet, menu, tab, tree

평가 축은 컴포넌트 책임, 과도한 abstraction, 정보 위계, HTML 의미 구조, 키보드·focus·상태 전달, 320px reflow, touch target, light/dark 대비, production bundle, 회귀 방지다.

## 점수

| 평가축 | 가중치 | 점수 | 근거 |
| --- | ---: | ---: | --- |
| 컴포넌트 구조·유지보수성 | 20% | 9.0 | 공용 shell/domain 경계를 유지하면서 Buckets·Transfers의 전달-only 계층 2개 제거 |
| 가시성·정보 위계 | 15% | 9.0 | light/dark/tablet/320px 시각 회귀 `10/10`, heading outline 정합성 확인 |
| 웹 표준·접근성 | 20% | 9.0 | onboarding `h2`, Objects fallback `h1`, axe·focus·forced colors·reflow 통과 |
| 반응형·모바일 작업 흐름 | 15% | 9.0 | iPhone 13/Pixel 7 기능 `98/100`과 부하 영향 2건 단독 재검증 `2/2` 통과 |
| 성능·번들 효율 | 15% | 8.5 | 초기 gzip `293.8 → 180.5kB`, 광범위 UI 강제 grouping 제거, 재설정 예산 통과 |
| 검증 체계·회귀 방지 | 15% | 9.5 | unit `1030/1030`, 접근성 묶음 `73/73`, 정적·시각·bundle gate 통과 |
| **가중 합계** | **100%** | **9.1** | 로컬 actionable finding을 닫고 외부 증거 범위는 합격으로 승격하지 않음 |

## 개선 결과

### 1. 초기 bundle 경계 단순화

Ant Design과 `rc-*` 전체를 `vendor-ui` 하나로 강제하던 규칙을 제거하고 Rollup의 실제 import graph에 분할을 맡겼다. 사용되지 않던 공용 fallback chunk도 제거했다. 수동 UI 하위 그룹과 route lazy boundary는 그대로 유지했다.

| 항목 | 개선 전 | 개선 후 | 최종 예산 |
| --- | ---: | ---: | ---: |
| initial JS gzip | `293.8kB` | `180.5kB` | `185.0kB` |
| ObjectsPage gzip | `63.4kB` | `82.1kB` | `85.0kB` |
| UploadsPageExperience gzip | 약 `4.4kB` | `4.6kB` | `5.0kB` |
| vendor-ui gzip | `161.8kB` | `4.9kB` | `170.0kB` |

초기 전송량은 `113.3kB`, 약 **38.6%** 감소했다. Objects와 Uploads의 route chunk는 자동 분할 경계에서 커졌으나 초기 preload에서 빠졌고, 반복 production build가 동일 수치로 안정적이었다. 예산은 측정된 기준에 각각 `4.5kB`, `2.9kB`, `0.4kB` 여유만 두어 이후 회귀를 계속 차단한다.

### 2. heading 의미 구조 정합성

- Profiles onboarding의 `Getting started`를 route `h1` 아래 `h2`로 수정했다.
- onboarding이 실제로 보이는 no-profile 상태를 whole-page axe 시나리오에 추가했다.
- Objects lazy loading fallback을 최종 page header와 같은 `h1`으로 맞췄다.

### 3. 전달-only wrapper 제거

- Buckets: `BucketsDialogsHost`를 삭제하고 `BucketsDialogsPanel`을 기존 구현의 단일 re-export seam으로 축소했다.
- Transfers: 한 호출자뿐인 `TransfersDrawerHost`를 삭제하고 이미 lazy인 `TransfersRuntimeUiHost`가 drawer를 직접 렌더링하도록 했다.
- import graph는 `551 files / 1,147 edges`에서 `549 files / 1,146 edges`로 감소했고 cycle은 없다.

### 4. 사용되지 않는 dependency 제거

source/test import가 없던 `@tanstack/react-table`과 lockfile 항목을 제거했다. 실제 virtualization에 쓰이는 `@tanstack/react-virtual`은 유지했다.

전체 diff는 **21 insertions / 115 deletions**로, 약 94 lines 순감소와 직접 dependency 1개 제거다.

## 현재 증거

### 소스와 구조

- `frontend/src`: TypeScript/TSX/CSS `855` files
- TypeScript/TSX: `116,729` lines — 생성 OpenAPI와 테스트 포함
- unit test files: `252`
- Playwright spec files: `64`
- import graph: `549` files / `1,146` runtime edges, cycle 없음
- production build: `3,417` modules transformed, 성공

파일 수와 LOC는 결함 수가 아니라 변경 면적과 감사 우선순위 판단에만 사용했다.

### 실행 검증

| 검증 | 결과 |
| --- | --- |
| Vitest 전체 | `252/252` files, `1030/1030` tests 통과 |
| iPhone 13·Pixel 7 모바일 작업 흐름 | `98/100` 기능 통과, 병렬 부하 초과 2건 단독 재검증 `2/2` 통과 |
| axe·dark·320px reflow·Objects density·preview | `73/73` 통과, live-provider `1`건 의도적 skip |
| 디자인 시각 회귀 | `10/10` 통과 |
| production build·bundle budget | 통과 |
| ESLint | 통과 |
| CSS token | `50` CSS files / `99` tokens, 통과 |
| light/dark contrast matrix | 추적 조합 전체 통과 |
| import cycle | 통과 |
| geometry probe policy | 통과 |
| OpenAPI drift | 통과 |
| bundle-report 자체 테스트 | `2/2` 통과 |

모바일 전체 실행의 첫 Objects 렌더 시간 검사는 12-worker 호스트 부하에서 iPhone `6.7s`, Pixel `5.4s`로 3초 예산을 넘겼다. 같은 두 시나리오를 2 workers로 재실행했을 때 각각 `2.8s`로 통과했다. 따라서 기능 회귀로 판정하지 않지만, 100/100 단일 실행 통과로 과장하지 않는다.

Playwright fixture가 소유하지 않은 thumbnail/realtime 요청에서 localhost proxy `ECONNREFUSED` 로그가 있었지만 검증한 assertion은 통과했다. 이 로그를 실제 backend/provider 성공 증거로 사용하지 않는다.

## 화면군별 최종 판정

| 화면군 | 판정 | 핵심 근거 | 남은 외부 위험 |
| --- | --- | --- | --- |
| Login/bootstrap | GO | narrow login, invalid token recovery, dark/axe, zoom 허용 | 실제 browser cold-load/RUM |
| Profiles | GO | table/card, onboarding `h2`·axe, stale response 차단 | 실제 보조기술 |
| Buckets | GO | provider overlay, mobile card, wrapper 축소 | 실제 provider 데이터 |
| Objects | GO | density, mobile, search/tree/details/preview, fallback `h1`, budget | 대규모 production 목록 분포 |
| Uploads/Transfers | GO | mobile queue, lazy experience, drawer waterfall 제거 | 실제 device/provider 전송 |
| Jobs/Activity | GO | filters/details/logs, virtualization, axe | multi-user/장기 실행 |
| Settings/shell | GO | focus, safe area, reduced motion | 실제 OS 확대·보조기술 |

## 남은 advisory와 증거 경계

정적 디자인 advisory 58건은 transparent background, compact radius, opacity, removed shadow 패턴을 검토 대상으로 알린다. contrast matrix와 rendered hierarchy `10/10`이 통과했으므로 문자열 일치만으로 shadow·radius를 추가하지 않았다. 그렇게 하면 card 중첩과 시각 소음을 키울 수 있다.

이 분석이 증명하는 범위:

- 현재 checkout의 source/static contract
- deterministic fixture 기반 Vitest
- Playwright Chromium desktop, iPhone 13/Pixel 7 emulation
- axe 자동 규칙, forced colors, keyboard/focus 시나리오
- production build와 local bundle stats

이 분석이 증명하지 않는 범위:

- Safari/WebKit과 Firefox 실제 400% text-only zoom
- VoiceOver, TalkBack, NVDA end-to-end 작업 완료
- 물리 iPhone/Android safe area, OS 글자 확대, 실제 터치 오차
- authenticated provider 데이터와 대규모 production 목록 분포
- reverse proxy, protected deployment, CDN compression/cache, real-user performance

## 완료 판정

최초 분석의 로컬 P1/P2 우선순위 1~6은 모두 구현·검증됐다. 현재 checkout의 정적, unit, rendered Chromium, production bundle gate는 **GO**다. 외부 수동 검증은 별도 release evidence로 남으며 이 로컬 분석의 완료를 막지는 않지만, production·실기기 합격으로 표현해서는 안 된다.
