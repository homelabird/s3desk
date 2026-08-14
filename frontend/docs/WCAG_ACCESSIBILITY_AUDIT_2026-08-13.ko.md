# S3Desk Google Material · Apple HIG · WCAG 2.2 접근성 감사 리포트

작성일: 2026-08-13  
기준: Google Material 접근성 지침, Apple Human Interface Guidelines, WCAG 2.2 Level A / AA
관점: 프론트엔드 구현 품질과 실제 클라이언트 사용성

## 결론

현재 프론트엔드는 시맨틱 구조, 접근 가능한 이름, 기본 키보드 조작, 포커스 트랩, 색상 토큰에서 비교적 강한 기반을 갖고 있다. 아래 개선 작업 후 핵심 화면 리플로우, 실제 렌더링 axe, Objects 밀도·타깃 검사를 합친 Chromium 회귀 검사를 통과했다. light/dark 전환 중 아이콘 대비가 잠시 무너지는 현상은 테마 교체 프레임의 transition을 차단해 해소했고, 투명 사용자 이미지는 두 테마에서 같은 중립 checkerboard 위에 원본 그대로 표시한다.

확인됐던 WCAG 2.1.4 위반은 전역 문자 단축키와 안내 UI를 제거해 해소했다. 핵심 7개 모바일 화면의 유효 pointer target도 Apple의 `44×44pt`와 Google Material의 `48×48dp`를 함께 만족하는 `48×48px` 하한으로 보정했다. 계산된 글꼴 크기를 2배로 확대한 자동 검사에서 발견한 모바일 page subtitle 잘림도 공용 소유 CSS에서 해소했다. 다만 실제 Chrome/Firefox zoom과 보조기술 수동 증거가 남아 있어 세 기준의 완전 준수를 선언하지 않는다.

| 기준 | 판정 | 핵심 근거 |
| --- | --- | --- |
| WCAG 2.2 A/AA | 검사 범위 내 통과·전체 미확정 | 확인된 2.1.4 위반 제거. Chromium/Firefox 핵심 화면 2.5.8 실패 gate와 `320px` 리플로우 통과. 실제 zoom·보조기술 증거는 남음 |
| Apple HIG 접근성 | 검사 범위 내 통과·전체 미확정 | 핵심 모바일 화면 target `48px`, forced-colors, 의미·역할·대비 검사 통과. VoiceOver/Larger Text 수동 증거는 남음 |
| Google Material 접근성 | 검사 범위 내 통과·전체 미확정 | 핵심 모바일 화면 target `48px`, label/role, 상태, reduced motion 검사 통과. TalkBack 실제 작업 증거는 남음 |

| 최초 감사 판정 | 수량 | 의미 |
| --- | ---: | --- |
| 확인된 미충족 | 0 | 기존 1건을 코드와 회귀 검사로 해소함 |
| 높은 위험 / 검증 필요 | 2 | 실제 브라우저 zoom과 보조기술 증거가 남음 |
| 통과 근거 있음 | 6개 영역 | 검사한 화면과 상태 범위에서만 통과 |

## 개선 작업 결과

| 우선순위 | 상태 | 구현·검증 결과 |
| --- | --- | --- |
| P0 리플로우 | 완료 | Login, Profiles, Buckets, Objects와 view-options sheet, Uploads, Jobs, Settings를 `320x800`에서 검사하고 페이지·dialog 수평 overflow와 핵심 기능 접근성을 확인함 |
| P0 문자 단축키 | 완료 | `?`, `G → P/B/O/U/J`, dead guide, shell plumbing을 제거하고 문자 입력 후 route/dialog 불변을 E2E로 확인함 |
| P0 타깃 크기 | 완료(핵심 화면) | label/Ant wrapper를 포함한 실제 hit area를 측정하고 WCAG `24px` 및 Apple/Google 공통 `48px` 실패 assertion을 추가함. 7개 화면 미달 0건 |
| P0 포커스 비가림 | 완료(대표 흐름) | Objects 검색 drawer에서 초기 포커스, 8회 Tab 순회 중 viewport 노출, `Escape` 후 trigger 복귀를 브라우저에서 확인함 |
| P1 작은 정보 텍스트 | Chromium/Firefox 자동 검사 완료·실제 zoom 대기 | 의미 있는 `9–11px` label/meta를 `12px` 이상으로 보정하고, 200% 계산 글꼴 확대에서 발견한 모바일 subtitle 말줄임을 제거함. 실제 Firefox text-only zoom은 남음 |
| P1 실제 대비 | 완료(선정 상태) | Profile 편집 light/dark, Objects 검색 light/dark, 기존 warning/error/selected fixture의 axe 검사를 수행함. 다크 Profile disclosure 배경을 교정하고 테마 교체 중 transition을 차단해 중간 프레임의 아이콘 대비 저하를 제거함 |
| P1 사용자 미디어 가시성 | 완료(공용 preview) | image viewer, object thumbnail/details, transfer preview에 테마 독립 중립 checkerboard를 적용하고 black/white 투명 SVG와 `filter: none`을 light/dark에서 검증함 |
| P1 forced-colors | 완료(대표 흐름) | Objects 전역 nav, focus, selection semantics와 axe를 `forcedColors: active`에서 검사하고 system outline fallback을 추가함 |
| P1 axe matrix | 완료(대표 상태) | Login 오류, Buckets empty/loading, Objects disabled와 핵심 7개 정상 상태 및 주요 overlay를 검사함. 모든 상태 곱집합은 만들지 않음 |
| P2 수동 보조기술 | 미실행 | NVDA/VoiceOver, Windows High Contrast, Firefox text-only zoom은 해당 OS·보조기술 환경에서 별도 수행 필요 |

## 감사 범위와 방법

검토 화면:

- 로그인, Profiles, Buckets, Objects, Uploads, Jobs, Settings
- 전역 헤더와 기본 내비게이션
- 검색, 이미지 뷰어, 전송, 설정, 프로필 편집, 버킷 정책·거버넌스 오버레이
- 데스크톱, 태블릿, `320px`/`390px` 모바일, light/dark 일부 상태

사용한 증거:

- 현재 React/TypeScript/CSS 소스의 상호작용 소유 컴포넌트 검토
- `@axe-core/playwright` 기반 전체 페이지 및 오버레이 검사
- Playwright 렌더링·모바일 overflow·표면 위계 검사
- light/dark 디자인 토큰 대비 계산
- 포커스, 키보드, reduced-motion, accessible name 관련 구현과 테스트 검토

실행 결과:

```text
npm --prefix frontend run check:design
  CSS token check: pass (50 CSS files, 83 tokens)
  contrast pairs: pass for all tracked light/dark pairs
  design advisory patterns: 59 findings (non-blocking)

npm --prefix frontend run test:e2e:design-audit
  10 passed

npm --prefix frontend run test:e2e -- tests/wcag-reflow.spec.ts --project=chromium
  7 passed; 핵심 7개 화면의 유효 24/44/48px 미달 0건
  계산된 글꼴 크기 200% 확대 후 수평 overflow와 unlabeled clipped text 0건

npm --prefix frontend run test:e2e:firefox-reflow
  7 passed; 동일 reflow, target, 200% 계산 글꼴 확대 gate를 Firefox 144에서 통과

npm --prefix frontend run test:e2e -- \
  tests/wcag-reflow.spec.ts \
  tests/objects-layout-density.spec.ts \
  tests/dark-theme-accessibility.spec.ts \
  tests/accessibility-overlays.spec.ts \
  tests/objects-image-preview.spec.ts \
  --project=chromium
  72 passed

npm --prefix frontend run test:unit -- \
  src/components/__tests__/useOverlayLayer.test.tsx \
  src/__tests__/FullAppOverlaysHost.test.tsx \
  src/__tests__/themeMode.test.tsx \
  src/__tests__/useFullAppController.test.tsx \
  src/lib/__tests__/keyboardShortcuts.test.ts
  10 passed

npm --prefix frontend run test:unit
  252 test files, 1014 tests passed

npm --prefix frontend run build
  TypeScript build and Vite production bundle passed (3423 modules transformed)

npm --prefix frontend run check:e2e:geometry
  pass; 의도적인 reflow, target, clipped-text 측정만 허용 표식과 함께 사용

npm --prefix frontend run typecheck
  pass

npm --prefix frontend run lint
  pass
```

## 해소된 미충족

### A11Y-01 — 전역 단일 문자 단축키 제거 완료

- 상태: 완료
- WCAG: 2.1.4 Character Key Shortcuts (Level A)
- 영향 사용자: 음성 입력 사용자, 키보드 사용자, 운동 장애 사용자
- 영향 화면: 인증 후 전체 애플리케이션 shell

modifier 없는 `?`와 `G → P/B/O/U/J`, 도달 불가능해진 shortcut guide, shell의 guide 상태 plumbing을 모두 제거했다. 기존 메뉴와 기본 내비게이션이 동일 route 접근을 유지한다.

근거:

- `src/lib/useKeyboardShortcuts.ts`와 테스트 삭제
- `src/components/KeyboardShortcutGuide.tsx`와 테스트 삭제
- `useFullAppShellState` → `useFullAppShellViewModel` → `useFullAppController` → `FullAppOverlaysHost`의 guide plumbing 삭제
- `tests/wcag-reflow.spec.ts`에서 `?`, `g`, `p` 입력 후 URL 불변과 shortcut dialog 부재 확인

완료 증거: 관련 단위 테스트 5개, typecheck, 문자 입력 E2E가 통과했다.

## 높은 위험 및 미검증 항목

아래 항목은 현재 미충족이라고 단정하지 않는다. 다만 WCAG AA 준수를 주장하려면 추가 증거가 필요하다.

### A11Y-02 — 실제 400% zoom과 전체 상태 리플로우 증거 없음

- 우선순위: 높음
- WCAG: 1.4.10 Reflow (AA)

Objects 화면은 `320px` viewport에서 페이지 전체 수평 overflow가 없음을 검사한다. 로그인·Settings 일부도 `320px` 반응형 테스트가 있다. 하지만 이는 `1280px` 화면의 400% 확대와 동일한 전체 제품 검사가 아니며, 오버레이·긴 S3 key·정책 편집기·테이블 셀의 정보/기능 손실까지 확인하지 않는다.

개선 후 `tests/wcag-reflow.spec.ts`가 핵심 7개 화면과 Objects view-options sheet, Settings drawer를 Chromium과 Firefox의 `320 CSS px`에서 검사한다. 각 화면의 계산된 글꼴 크기를 200%로 확대한 뒤 페이지·활성 overlay의 수평 overflow와 접근 가능한 대체 이름이 없는 clipped text도 실패시킨다. 이 검사에서 모바일 `PageHeader` subtitle의 2줄 강제 말줄임을 발견해 제거했다. 이 자동 증거로 대표 리플로우 위험은 닫았지만, 모든 긴 key·정책 편집 상태와 실제 브라우저 UI zoom 조합은 준수 경계로 남긴다.

클라이언트 위험:

- 저시력 사용자가 확대했을 때 sticky header, drawer, action row가 콘텐츠나 포커스를 가릴 수 있다.
- 테이블 자체는 예외가 될 수 있어도 테이블 밖 설명·버튼·개별 셀 콘텐츠 손실은 예외가 아니다.

필요 증거:

- Chrome/Firefox의 실제 400% zoom과 200% text-only zoom에서 핵심 7개 화면을 수동 확인
- 긴 key, 정책 편집, 오류·로딩 상태에서 페이지 단위 양방향 스크롤, 잘린 버튼, 가려진 포커스가 없음을 확인

### A11Y-03 — 핵심 화면 타깃 크기 자동 gate 완료

- 우선순위: 높음
- WCAG: 2.5.8 Target Size (Minimum) (AA)

native input의 visible wrapper, 연결 label, Ant control wrapper를 실제 hit area로 해석하고, WCAG spacing/inline 예외가 없는 `24px` 미달과 Apple/Google 공통 `48px` 미달을 실패시키는 gate를 추가했다.

근거:

- `src/index.css` — `max-width: 768px`의 pointer controls, form wrapper, checkbox/radio label에 `48px` 하한
- `src/FullAppInner.module.css` — 모바일 brand 및 shell controls `48px`
- `src/pages/objects/ObjectsListView.module.css` — compact sort target `48px`
- `tests/wcag-reflow.spec.ts` — `24px` WCAG gate와 `48px` Apple/Google gate

`320×800` Chromium에서 렌더링된 유효 target 결과는 다음과 같다.

| 화면 | 측정 제어 | `<24px` 후보 | `<44px` 후보 | `<48px` 후보 |
| --- | ---: | ---: | ---: | ---: |
| Login | 3 | 0 | 0 | 0 |
| Profiles | 11 | 0 | 0 | 0 |
| Buckets | 10 | 0 | 0 | 0 |
| Objects + view options | 43 | 0 | 0 | 0 |
| Uploads | 9 | 0 | 0 | 0 |
| Jobs | 20 | 0 | 0 | 0 |
| Settings | 18 | 0 | 0 | 0 |

비가시 skip link는 focus 노출을 별도 키보드 흐름으로 검증하고 이 inventory에서는 제외한다. inline link는 WCAG 예외를 유지한다.

### A11Y-04 — 포커스 비가림과 실제 보조기술 흐름 미검증

- 우선순위: 중간
- WCAG: 2.4.11 Focus Not Obscured (Minimum) (AA), 1.3.2 Meaningful Sequence, 4.1.3 Status Messages

skip link, `:focus-visible`, dialog focus trap, live region 구현과 단위 테스트는 존재한다. 그러나 sticky header/drawer가 키보드 포커스를 가리지 않는지, NVDA/VoiceOver에서 가상 목록과 비동기 전송 상태가 자연스러운 순서와 빈도로 읽히는지는 현재 자동 검사로 증명되지 않았다.

개선 후 Objects 검색 drawer의 초기 포커스·Tab 순회 노출·trigger 복귀는 E2E로 확인한다. NVDA/VoiceOver 읽기 순서와 상태 알림 품질은 여전히 수동 검증 대상이다.

필요 증거:

- 핵심 작업의 Tab/Shift+Tab 순회와 포커스 viewport 교차 검사
- NVDA + Chrome 또는 VoiceOver + Safari로 로그인, 객체 선택/작업 메뉴, 업로드 큐, 오류 복구 수동 시나리오

## 통과 근거가 있는 영역

### Google Material · Apple HIG 공통 기준 대조

| 디자인 원칙 | 현재 근거 | 판정 |
| --- | --- | --- |
| 충분한 텍스트 대비 | 추적된 light/dark 조합이 WCAG AA 기준 통과, 대표 실제 상태 axe 위반 0 | 통과 근거 있음 |
| 색상만으로 상태 전달하지 않기 | 선택·오류·위험 상태에 텍스트, 아이콘, border를 함께 사용 | 통과 근거 있음 |
| 명확하고 짧은 접근성 이름 | 주요 icon button, tabs, tree, dialog에 action 중심 이름·역할 제공 | 통과 근거 있음 |
| 큰 글자/리플로우 | 핵심 7개 화면 `320 CSS px` 리플로우 통과 | 부분 통과; 실제 Dynamic Type/200% text-only zoom 미검증 |
| 모션 감소 | `prefers-reduced-motion`에서 animation/transition과 smooth scroll 제거 | 통과 근거 있음 |
| 플랫폼 권장 터치 타깃 | 핵심 모바일 화면의 유효 pointer target이 Apple `44`, Google `48` 기준을 충족 | 검사 범위 내 통과 |
| 실제 스크린리더 작업 완료 | 코드·axe 증거는 있으나 TalkBack/VoiceOver 실제 작업 흐름 미실행 | 미검증 |

### 구조와 접근 가능한 이름

- 전역 `nav`에 이름과 현재 페이지 상태가 있다.
- 본문 skip link와 focusable `main`이 있다.
- form label, dialog name, 버튼 이름, switch name/state가 주요 화면에 제공된다.
- axe가 Profiles, Buckets, Objects, Uploads, Jobs 전체 페이지와 주요 overlay 상태에서 위반 0건을 보고했다.

### 키보드 기본 조작

- 버튼·링크·네이티브 입력을 우선 사용한다.
- tabs, tree, menu, object list에 방향키/Enter/Space/Context Menu 대응이 있다.
- dialog/sheet는 Escape, 초기 포커스, focus trap, 닫힌 후 포커스 복귀를 공통 overlay 계층에서 처리한다.
- 전역 단일 문자 단축키는 제거했으며, route와 dialog가 변하지 않는 회귀 검사를 둔다.

### 색상 대비

- 추적된 light/dark 텍스트·링크·상태·sidebar 조합은 기준값을 통과했다.
- axe의 실제 렌더링 대비 검사는 새 다크 Profile 편집 fixture에서 결함을 검출했고, 배경 혼합 수정 후 위반 0건을 확인했다.
- 테마 전환 시 `data-theme-changing` 상태에서 색상 transition을 두 animation frame 동안 차단하고, 실제 테마 속성 변경 순간 표본 control의 transition duration이 모두 `0s`인지 검사한다.
- 투명 사용자 이미지에는 필터나 반전을 적용하지 않고, black/white 콘텐츠가 어느 테마에서도 배경과 합쳐지지 않도록 같은 중립 checkerboard를 사용한다.
- 정적 대비 스크립트는 14개 지정 토큰 조합만 계산하므로 모든 `color-mix`, opacity, 이미지 배경을 포괄하지는 않는다.

### 반응형과 확대 기반

- 핵심 7개 화면은 `320px`에서 페이지 수평 overflow 없음과 핵심 콘텐츠 접근성이 자동 검증된다.
- Profiles/Buckets는 작은 화면에서 테이블 대신 카드 레이아웃으로 전환된다.
- 모바일 핵심 화면의 유효 pointer target은 `48px` 하한을 확보한다.
- 이는 대표적인 400% 동등 조건 증거이며, 모든 데이터·브라우저 zoom 조합을 대체하지 않는다.

### 모션

- `prefers-reduced-motion: reduce`에서 animation과 transition을 사실상 제거하고 smooth scrolling을 끈다.
- 기본 모션 설정에서도 테마 토큰이 교체되는 짧은 구간만 transition을 차단해 중간 색상 대비 저하를 만들지 않는다.

### 상태와 오류 전달

- 로딩·전송 요약에 `role="status"`, `aria-live`, `aria-atomic`이 사용된다.
- 입력 오류는 `aria-invalid`와 `aria-describedby`로 연결된다.
- 경고·오류는 색만이 아니라 아이콘과 텍스트를 함께 사용한다.

## 클라이언트 관점 디자인 평가

### 잘 된 점

- 모바일 핵심 화면이 단순 축소 테이블이 아니라 카드/시트 구조로 바뀌어 조작 가능성이 높다.
- focus ring, active navigation, selected row가 서로 다른 시각 상태를 사용한다.
- light/dark 양쪽의 기본 대비와 위험/경고 메시지 가독성이 안정적이다.
- 공통 dialog, sheet, tabs, tree가 접근성 책임을 중앙에서 소유한다.

### 개선이 필요한 점

- 감사 당시 Profile 편집과 고급 설정에 반복되던 의미 있는 `9–11px` 보조 텍스트는 `12px` 이상으로 보정했다. 계산 글꼴 200% 확대 자동 검사는 통과했으며 실제 Firefox text-only zoom 확인은 남아 있다.
- 모바일 `PageHeader` subtitle은 2줄 line clamp를 제거해 작은 화면과 텍스트 확대에서 전체 설명을 유지한다.
- Objects workspace 닫기 타깃을 포함해 핵심 화면의 label/wrapper 기준 실제 hit area를 검사하고, 설명 없는 `24px` 미달과 비-inline `48px` 미달을 실패시키는 gate를 추가했다.
- 디자인 검사에서 opacity 스타일 등 advisory 패턴 59건이 남았다. 모두 접근성 결함은 아니며 이번 범위에서는 실제 사용자 정보 텍스트와 선정 상태를 axe로 검증했다.

권장 디자인 기준:

- 정보성 본문과 상태 텍스트는 가능하면 `12px` 미만을 사용하지 않는다.
- 독립 아이콘 버튼은 예외 계산에 의존하지 않고 `24x24px` 이상, touch 화면은 Apple과 Google을 함께 만족하는 `48x48px`를 기본으로 한다.
- 선택/오류/위험 상태는 색상 외에 텍스트, 아이콘, border 또는 위치 변화 중 하나 이상을 유지한다.

## 우선순위별 실행안

### 실행 순서

`A11Y-P0-01 → A11Y-P0-02 → A11Y-P0-03 → A11Y-P1-01/P1-02 → A11Y-P2-01` 순서로 진행한다. P0는 출시 전 코드 작업, P1은 자동·브라우저 검증 확장, P2는 실제 보조기술 수동 증거다. 기존 Playwright와 axe를 재사용하며 새 접근성 의존성은 추가하지 않는다.

| ID | 산출물 | 상태 | 릴리스 조건 |
| --- | --- | --- | --- |
| A11Y-P0-01 | 전역 문자 단축키와 dead guide 제거 | 완료 | 필수 |
| A11Y-P0-02 | WCAG `24px` target 예외·실패 판정 gate | 완료 | 필수 |
| A11Y-P0-03 | touch viewport 유효 target `48px` 정렬 | 완료 | 필수 |
| A11Y-P1-01 | 실제 zoom·forced-colors 결과 | forced-colors·Chromium/Firefox 200% 계산 글꼴 확대 완료, 실제 zoom 대기 | 필수 |
| A11Y-P1-02 | 대표 상태 axe matrix | 완료 | 필수 |
| A11Y-P2-01 | NVDA·VoiceOver·High Contrast·TalkBack 기록 | 미실행 | RC 필수 |

### A11Y-P0-01 — 전역 문자 단축키 제거

- 상태: 완료
- 이유: 유일하게 확인된 WCAG Level A 위반이며 다른 작업과 독립적이다.
- 삭제 파일: `src/lib/useKeyboardShortcuts.ts`, `src/lib/__tests__/useKeyboardShortcuts.test.tsx`, `src/components/KeyboardShortcutGuide.tsx`, `src/components/__tests__/KeyboardShortcutGuide.test.tsx`.
- plumbing 정리: `src/useFullAppShellState.ts`, `src/useFullAppShellViewModel.ts`, `src/useFullAppController.ts`, `src/FullAppOverlaysHost.tsx`에서 `guideOpen`, `setGuideOpen`, `guide` prop과 lazy import를 제거한다. 관련 mock/assertion은 `src/__tests__/FullAppOverlaysHost.test.tsx`, `src/__tests__/useFullAppController.test.tsx`에서 삭제한다.
- 유지 파일: `src/lib/keyboardShortcuts.ts`는 Objects command palette/path shortcut의 편집-field 보호에도 사용되므로 삭제하지 않는다.
- 구현: modifier 없는 `?`와 `G → P/B/O/U/J` 기능 전체를 제거한다. 도달 불가능한 안내 modal을 남기지 않는다. 설정 화면이나 재지정 시스템은 만들지 않는다.
- 완료 조건:
  - 비편집 영역에서 `?`, `g`, `g p`를 입력해도 modal이나 route가 변하지 않는다.
  - 기존 nav와 app menu로 Profiles/Buckets/Objects/Uploads/Jobs에 계속 접근 가능하다.
  - `tests/wcag-reflow.spec.ts`에 문자 입력 후 route·dialog 불변 assertion 1개가 남는다.
  - `npm --prefix frontend run test:unit -- src/__tests__/FullAppOverlaysHost.test.tsx src/__tests__/useFullAppController.test.tsx src/lib/__tests__/keyboardShortcuts.test.ts` 통과.
- 크기: S. 선행 작업 없음.

### A11Y-P0-02 — WCAG 2.5.8 후보를 실제 hit area 기준으로 판정

- 상태: 완료
- 이유: 현재 `13–22px` 후보에는 label/wrapper가 hit area를 확장하는 false positive가 섞여 있다.
- 변경 파일: `tests/wcag-reflow.spec.ts`
- 실패 시에만 수정할 소유 파일: `src/pages/objects/ObjectsListView.module.css`, `src/pages/objects/ObjectsSearch.module.css`, `src/pages/UploadsPage.module.css`.
- 구현:
  1. checkbox/radio/input은 연결된 `label`, Ant wrapper, 동일 기능의 큰 target을 함께 측정한다.
  2. `24px` 미달이면 WCAG spacing/equivalent/inline 예외 중 적용 근거를 테스트 이름이나 assertion에 명시한다.
  3. 예외가 없으면 해당 소유 CSS에서만 hit area를 `24×24 CSS px` 이상으로 보정한다.
- 완료 조건:
  - 7개 핵심 화면에서 설명 없는 `<24px` target 0건.
  - 결과가 단순 console inventory가 아니라 실패 가능한 assertion으로 남는다.
  - `npm --prefix frontend run test:e2e -- tests/wcag-reflow.spec.ts --project=chromium` 통과.
- 크기: M. P0-03의 선행 작업.

### A11Y-P0-03 — 모바일 pointer target을 48px 기준으로 통일

- 상태: 완료
- 이유: Apple `44×44pt`와 Google Material `48×48dp`를 동시에 만족하려면 touch viewport에서 `48px`를 공통 하한으로 잡는 것이 가장 단순하다. 데스크톱 밀도는 유지한다.
- 공통 소유 파일:
  - shell: `src/FullAppInner.module.css`, `src/components/PageHeader.module.css`, `src/components/appTabs.module.css`
  - overlay: `src/components/DialogModal.module.css`, `src/components/OverlaySheet.module.css`
- 화면별 소유 파일:
  - Jobs `32–32.8px`: `src/pages/jobs/JobsToolbar.module.css`, `src/pages/jobs/JobsTableSection.module.css`, `src/pages/jobs/JobsRowActions.tsx`
  - Settings `38px`: `src/pages/SettingsPage.module.css`
  - Objects `28–36px`: `src/pages/objects/ObjectsDetails.module.css`, `src/pages/objects/ObjectsGridCards.module.css`, `src/pages/objects/ObjectsSearch.module.css`
- 구현: `max-width: 768px` 범위에서 실제 pointer target만 `min-width/min-height: 48px`로 확장한다. 아이콘 자체, switch thumb, inline text link는 확대하지 않는다. `size="small"`을 쓰는 모바일 Jobs 행 작업은 CSS hit area 보정으로 텍스트 밀도를 유지한다.
- 완료 조건:
  - 7개 핵심 화면의 유효 pointer target이 모두 `48×48px` 이상이거나 inline/equivalent 예외가 기록된다.
  - `769px` 이상 데스크톱 target geometry는 기존 스냅샷과 동일하다.
  - `320px`에서 새 수평 overflow와 첫 viewport CTA 손실이 없다.
  - `test:e2e:design-audit` 10개와 `wcag-reflow.spec.ts` 7개 통과 후 변경된 스냅샷을 사람이 확인한다.
- 크기: M. P0-02 완료 후 진행.

### A11Y-P1-01 — 실제 확대·forced-colors 브라우저 검증

- 상태: forced-colors와 Chromium/Firefox 200% 계산 글꼴 확대 자동 검증 완료, 실제 Chrome/Firefox UI zoom 수동 검증 대기
- 변경 파일: 자동화 가능한 forced-colors는 `tests/accessibility-overlays.spec.ts`; 실제 zoom 결과는 이 리포트의 검증 표에 기록한다.
- 자동 검증: Playwright `forcedColors: active`에서 전역 nav, focus ring, selected row, warning/error가 색 없이 구분되는지 확인한다.
- 수동 검증: Chrome과 Firefox에서 `400%` page zoom 및 `200%` text-only zoom으로 7개 핵심 화면, Objects 긴 key, Bucket policy, Settings drawer를 확인한다.
- 완료 조건: 양방향 페이지 스크롤, 잘린 텍스트·버튼, 가려진 포커스, 기능 손실 0건. 발견 시 화면·viewport·재현 순서와 owner file을 기록한다.
- 크기: M. P0와 병렬 가능.

### A11Y-P1-02 — axe 상태 matrix의 실제 공백만 추가

- 상태: 완료
- 변경 파일: `tests/accessibility-overlays.spec.ts`, `tests/dark-theme-accessibility.spec.ts`.
- 구현: 현재 없는 대표 `empty`, `loading`, `error`, `disabled` 상태만 기존 fixture에 추가한다. 모든 상태의 곱집합은 만들지 않는다.
- 완료 조건: 핵심 7개 화면의 정상 상태와 사용자 대응이 필요한 오류 상태가 light/dark 중 적용 가능한 테마에서 axe 위반 0건이다.
- 크기: S.

### A11Y-P2-01 — 릴리스 후보 보조기술 수동 확인

- 상태: 미실행 — 해당 OS와 실제 보조기술 환경 필요

| 환경 | 반드시 완료할 흐름 | 기록할 증거 |
| --- | --- | --- |
| NVDA + Chrome | 로그인 → Objects 탐색 → 객체 선택 → 작업 메뉴 → Transfers 상태 | 이름/역할/값, 읽기 순서, live region 중복 여부, 결과 |
| VoiceOver + Safari | 모바일 nav → Uploads → source sheet → 오류 복구 | rotor 탐색, dialog 진입/이탈, focus 복귀, 결과 |
| Windows High Contrast | 전역 nav → 선택 행 → 경고 → 위험 작업 | focus/selected/error 식별 여부와 스크린샷 |
| TalkBack + Chrome | Objects 탐색 → 필터 → 객체 작업 | swipe 순서, target 조작, 상태 발표 결과 |

- 완료 조건: 네 흐름의 환경·브라우저 버전·실행자·날짜·결과가 기록되고, 차단 결함 0건이다. 자동화 결과로 대체하지 않는다.
- 크기: M. RC 환경 필요.

### 최종 릴리스 게이트

```bash
npm --prefix frontend run check:design
npm --prefix frontend run test:e2e:design-audit
npm --prefix frontend run test:e2e:firefox-reflow
npm --prefix frontend run test:e2e -- \
  tests/wcag-reflow.spec.ts \
  tests/objects-layout-density.spec.ts \
  tests/dark-theme-accessibility.spec.ts \
  tests/accessibility-overlays.spec.ts \
  tests/objects-image-preview.spec.ts \
  --project=chromium
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run check:e2e:geometry
```

게이트 통과와 P2 수동 기록이 모두 있어야 “검사 범위 내 Apple/Google 접근성 지침 및 WCAG 2.2 A/AA 충족”으로 판정을 갱신한다.

### 하지 않을 작업

- 단축키 설정 화면이나 재지정 시스템
- advisory 59건의 기계적 일괄 수정
- 장식 SVG와 switch 내부 thumb의 강제 확대
- axe/Playwright와 중복되는 새 접근성 도구 도입

## 준수 판정 경계

이 리포트는 현재 로컬 소스, fixture 기반 Chromium 렌더링, axe와 Playwright 결과를 근거로 한다. 다음을 증명하지 않는다.

- 실제 운영 데이터와 모든 provider 조합
- Firefox/Safari의 전체 동작
- NVDA, JAWS, VoiceOver, TalkBack 실제 사용성
- OS 고대비/forced-colors 전체 호환성
- 모든 페이지 상태에 대한 WCAG 2.2 AA 인증

따라서 현재 판정은 **“검사한 Chromium 화면과 상태에서는 WCAG 2.2 A/AA, Apple HIG, Google Material 접근성 기준을 통과했지만, 실제 zoom과 보조기술 수동 증거가 없어 제품 전체 준수는 미확정”**이다.

## 기준 문서

- [Google Material Design Accessibility](https://m1.material.io/usability/accessibility.html)
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)
- [Apple — Differentiate Without Color Alone evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/differentiate-without-color-alone-evaluation-criteria)
- [WCAG 2.2 W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [Understanding 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)
- [Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [Understanding 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Understanding 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
