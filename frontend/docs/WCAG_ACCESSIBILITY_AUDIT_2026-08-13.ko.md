# S3Desk WCAG 2.2 접근성 감사 리포트

작성일: 2026-08-13  
기준: WCAG 2.2 Level A / AA  
관점: 프론트엔드 구현 품질과 실제 클라이언트 사용성

## 결론

현재 프론트엔드는 시맨틱 구조, 접근 가능한 이름, 기본 키보드 조작, 포커스 트랩, 색상 토큰에서 비교적 강한 기반을 갖고 있다. 아래 개선 작업 후 핵심 화면 리플로우, 실제 렌더링 axe, Objects 밀도·타깃 검사를 합친 Chromium 회귀 검사를 통과했다.

그러나 **WCAG 2.2 AA 준수 상태로 판정할 수는 없다.** 전역 단일 문자 키보드 단축키가 WCAG 2.1.4를 충족하지 않으며, 200% text-only zoom, 전체 활성 컨트롤 타깃 크기, 실제 보조기술에 대한 수동 증거가 남아 있다.

| 최초 감사 판정 | 수량 | 의미 |
| --- | ---: | --- |
| 확인된 미충족 | 1 | 현재 구현 근거로 성공 기준 위반이 확인됨 |
| 높은 위험 / 검증 필요 | 3 | 자동 검사 범위 밖이며 준수를 증명할 실측이 없음 |
| 통과 근거 있음 | 6개 영역 | 검사한 화면과 상태 범위에서만 통과 |

## 개선 작업 결과

| 우선순위 | 상태 | 구현·검증 결과 |
| --- | --- | --- |
| P0 리플로우 | 완료 | Login, Profiles, Buckets, Objects와 view-options sheet, Uploads, Jobs, Settings를 `320x800`에서 검사하고 페이지·dialog 수평 overflow와 핵심 기능 접근성을 확인함 |
| P0 타깃 크기 | 부분 완료 | workspace 탭 닫기 버튼을 최소 `24x24px`로 보정하고 렌더링 크기를 회귀 검사함. 전체 활성 컨트롤 인벤토리는 남음 |
| P0 포커스 비가림 | 완료(대표 흐름) | Objects 검색 drawer에서 초기 포커스, 8회 Tab 순회 중 viewport 노출, `Escape` 후 trigger 복귀를 브라우저에서 확인함 |
| P1 작은 정보 텍스트 | 구현 완료·수동 확인 대기 | Profiles/Buckets/Uploads의 의미 있는 `9–11px` label/meta를 `12px` 이상으로 보정하고 장식 아이콘은 유지함. 200% text-only zoom 수동 확인은 남음 |
| P1 실제 대비 | 완료(선정 상태) | Profile 편집 light/dark, Objects 검색 light/dark, 기존 warning/error/selected fixture의 axe 검사를 수행함. 다크 Profile disclosure의 흰색 혼합 배경 결함을 테마 배경 토큰으로 교정함 |
| P1 axe matrix | 부분 완료 | Login 정상·오류와 핵심 7개 화면 정상 상태, 주요 overlay를 검사함. 모든 empty/loading/error 조합의 완전한 곱집합은 의도적으로 만들지 않음 |
| P2 수동 보조기술 | 미실행 | NVDA/VoiceOver, Windows High Contrast, Firefox text-only zoom은 해당 OS·보조기술 환경에서 별도 수행 필요 |

단축키는 요청 범위대로 변경하지 않았다. A11Y-01 판정과 후속 선택지만 유지한다.

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
  CSS token check: pass (50 CSS files, 82 tokens)
  contrast pairs: pass for all tracked light/dark pairs
  design advisory patterns: 60 findings (non-blocking)

npm --prefix frontend run test:e2e:design-audit
  10 passed

npm --prefix frontend run test:e2e -- \
  tests/wcag-reflow.spec.ts \
  tests/objects-layout-density.spec.ts \
  tests/dark-theme-accessibility.spec.ts \
  tests/accessibility-overlays.spec.ts \
  --project=chromium
  62 passed

npm --prefix frontend run test:unit -- \
  src/components/__tests__/useOverlayLayer.test.tsx
  4 passed

npm --prefix frontend run typecheck
  pass

npm --prefix frontend run lint
  pass
```

## 확인된 미충족

### A11Y-01 — 전역 단일 문자 단축키를 끄거나 다시 지정할 수 없음

- 심각도: 높음
- WCAG: 2.1.4 Character Key Shortcuts (Level A)
- 영향 사용자: 음성 입력 사용자, 키보드 사용자, 운동 장애 사용자
- 영향 화면: 인증 후 전체 애플리케이션 shell

현재 `?`는 어느 비편집 영역에서나 단축키 안내를 열고, `G` 다음 `P/B/O/U/J`는 1초 안에 입력되면 페이지를 이동한다. 입력 요소에서는 제외되지만, 단축키를 끄거나 modifier 키 조합으로 바꾸거나 특정 컴포넌트에 포커스가 있을 때만 활성화하는 기능은 없다.

근거:

- `src/lib/useKeyboardShortcuts.ts:34-65` — document 전역 `keydown` 등록
- `src/lib/useKeyboardShortcuts.ts:38-44` — modifier 없는 `?`
- `src/lib/useKeyboardShortcuts.ts:48-63` — 문자만 사용하는 `G` 연속 단축키
- `src/components/KeyboardShortcutGuide.tsx:11-21` — 사용자에게 노출되는 단축키 목록
- 저장소 검색 결과 단축키 비활성화·재지정 설정 없음

클라이언트 영향:

- 음성 인식 중 일반 문자 발화가 예기치 않은 내비게이션이나 모달 열기로 이어질 수 있다.
- 사용자가 기능을 발견해도 회피 설정이 없어 반복 오작동을 막을 수 없다.

최소 개선안:

1. 가장 작은 안전한 변경은 `?`와 `G → 문자` 전역 단축키를 제거하는 것이다. 메뉴와 내비게이션으로 동일 기능을 수행할 수 있다.
2. 단축키를 유지해야 한다면 modifier가 포함된 조합으로 변경한다.
3. 단일 문자를 반드시 유지해야 한다면 Settings에 전체 비활성화 또는 재지정 기능을 제공하고 저장 상태와 E2E를 추가한다.

완료 증거:

- 음성 입력과 동일한 문자 이벤트가 내비게이션을 일으키지 않음
- 또는 사용자가 단축키를 끈 상태에서 `?`, `G P`가 아무 동작도 하지 않는 Playwright 테스트

## 높은 위험 및 미검증 항목

아래 항목은 현재 미충족이라고 단정하지 않는다. 다만 WCAG AA 준수를 주장하려면 추가 증거가 필요하다.

### A11Y-02 — 전체 화면 400% 리플로우 증거 없음

- 우선순위: 높음
- WCAG: 1.4.10 Reflow (AA)

Objects 화면은 `320px` viewport에서 페이지 전체 수평 overflow가 없음을 검사한다. 로그인·Settings 일부도 `320px` 반응형 테스트가 있다. 하지만 이는 `1280px` 화면의 400% 확대와 동일한 전체 제품 검사가 아니며, 오버레이·긴 S3 key·정책 편집기·테이블 셀의 정보/기능 손실까지 확인하지 않는다.

개선 후 `tests/wcag-reflow.spec.ts`가 핵심 7개 화면과 Objects view-options sheet, Settings drawer를 `320 CSS px`에서 검사한다. 이 자동 증거로 대표 리플로우 위험은 닫았지만, 모든 긴 key·정책 편집 상태와 실제 브라우저 zoom 조합은 준수 경계로 남긴다.

클라이언트 위험:

- 저시력 사용자가 확대했을 때 sticky header, drawer, action row가 콘텐츠나 포커스를 가릴 수 있다.
- 테이블 자체는 예외가 될 수 있어도 테이블 밖 설명·버튼·개별 셀 콘텐츠 손실은 예외가 아니다.

필요 증거:

- 핵심 7개 화면과 주요 오버레이를 `1280x1024` 기준 400% 확대 또는 동등한 `320 CSS px` 조건에서 실행
- 페이지 단위 양방향 스크롤, 잘린 버튼, 읽을 수 없는 긴 key, 가려진 포커스가 없다는 브라우저 assertion

### A11Y-03 — 최소 타깃 크기 전체 실측 없음

- 우선순위: 높음
- WCAG: 2.5.8 Target Size (Minimum) (AA)

모바일의 주요 CTA와 `ToggleSwitch`는 대체로 `44px` 높이를 사용한다. 감사 당시 데스크톱 workspace 탭 닫기 버튼은 `20px` 최소 너비를 사용했다. 작은 타깃도 충분한 간격이나 동등한 큰 타깃이 있으면 예외가 될 수 있으므로 소스 크기만으로 실패 판정하지 않았다.

근거:

- `src/components/appTabs.module.css` — workspace 닫기 타깃을 최소 `24x24px`로 보정함
- `src/components/KeyboardShortcutGuide.tsx:120-128` — 최소 폭·높이 없는 닫기 버튼
- `src/components/ToggleSwitch.module.css:10-14` — 양호한 `44x44px` 제어 영역

필요 증거:

- 모든 활성 컨트롤의 렌더링 bounding box와 인접 타깃 간격을 WCAG 2.5.8 예외 규칙까지 포함해 검사
- 미달 컨트롤은 최소 `24x24 CSS px`로 보장하는 것이 가장 단순함

### A11Y-04 — 포커스 비가림과 실제 보조기술 흐름 미검증

- 우선순위: 중간
- WCAG: 2.4.11 Focus Not Obscured (Minimum) (AA), 1.3.2 Meaningful Sequence, 4.1.3 Status Messages

skip link, `:focus-visible`, dialog focus trap, live region 구현과 단위 테스트는 존재한다. 그러나 sticky header/drawer가 키보드 포커스를 가리지 않는지, NVDA/VoiceOver에서 가상 목록과 비동기 전송 상태가 자연스러운 순서와 빈도로 읽히는지는 현재 자동 검사로 증명되지 않았다.

개선 후 Objects 검색 drawer의 초기 포커스·Tab 순회 노출·trigger 복귀는 E2E로 확인한다. NVDA/VoiceOver 읽기 순서와 상태 알림 품질은 여전히 수동 검증 대상이다.

필요 증거:

- 핵심 작업의 Tab/Shift+Tab 순회와 포커스 viewport 교차 검사
- NVDA + Chrome 또는 VoiceOver + Safari로 로그인, 객체 선택/작업 메뉴, 업로드 큐, 오류 복구 수동 시나리오

## 통과 근거가 있는 영역

### 구조와 접근 가능한 이름

- 전역 `nav`에 이름과 현재 페이지 상태가 있다.
- 본문 skip link와 focusable `main`이 있다.
- form label, dialog name, 버튼 이름, switch name/state가 주요 화면에 제공된다.
- axe가 Profiles, Buckets, Objects, Uploads, Jobs 전체 페이지와 주요 overlay 상태에서 위반 0건을 보고했다.

### 키보드 기본 조작

- 버튼·링크·네이티브 입력을 우선 사용한다.
- tabs, tree, menu, object list에 방향키/Enter/Space/Context Menu 대응이 있다.
- dialog/sheet는 Escape, 초기 포커스, focus trap, 닫힌 후 포커스 복귀를 공통 overlay 계층에서 처리한다.
- 단, A11Y-01의 전역 문자 단축키는 별도 실패다.

### 색상 대비

- 추적된 light/dark 텍스트·링크·상태·sidebar 조합은 기준값을 통과했다.
- axe의 실제 렌더링 대비 검사는 새 다크 Profile 편집 fixture에서 결함을 검출했고, 배경 혼합 수정 후 위반 0건을 확인했다.
- 정적 대비 스크립트는 14개 지정 토큰 조합만 계산하므로 모든 `color-mix`, opacity, 이미지 배경을 포괄하지는 않는다.

### 반응형과 확대 기반

- 핵심 7개 화면은 `320px`에서 페이지 수평 overflow 없음과 핵심 콘텐츠 접근성이 자동 검증된다.
- Profiles/Buckets는 작은 화면에서 테이블 대신 카드 레이아웃으로 전환된다.
- 모바일 주요 액션은 다수 화면에서 `44px` 높이를 확보한다.
- 이는 대표적인 400% 동등 조건 증거이며, 모든 데이터·브라우저 zoom 조합을 대체하지 않는다.

### 모션

- `prefers-reduced-motion: reduce`에서 animation과 transition을 사실상 제거하고 smooth scrolling을 끈다.

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

- 감사 당시 Profile 편집과 고급 설정에 반복되던 의미 있는 `9–11px` 보조 텍스트는 `12px` 이상으로 보정했다. 200% text-only zoom 수동 확인은 남아 있다.
- Objects workspace 닫기 타깃은 `24x24px`로 보정했다. 전체 제품 타깃 인벤토리와 예외 계산은 남아 있다.
- 디자인 검사에서 opacity 스타일 등 advisory 패턴 59건이 남았다. 모두 접근성 결함은 아니며 이번 범위에서는 실제 사용자 정보 텍스트와 선정 상태를 axe로 검증했다.

권장 디자인 기준:

- 정보성 본문과 상태 텍스트는 가능하면 `12px` 미만을 사용하지 않는다.
- 독립 아이콘 버튼은 예외 계산에 의존하지 않고 `24x24px` 이상, touch 화면은 `44x44px`를 기본으로 한다.
- 선택/오류/위험 상태는 색상 외에 텍스트, 아이콘, border 또는 위치 변화 중 하나 이상을 유지한다.

## 우선순위별 실행안

### 작업 범위 원칙

- 이번 개선 백로그는 리플로우, 타깃 크기, 포커스, 텍스트 가독성, 자동 검증을 우선한다.
- 단축키는 A11Y-01의 사실 기록만 유지하고 이번 구현 우선순위에서는 제외한다. 추후 다룰 때도 새 설정 화면보다 modifier 조합 전환 또는 제거를 먼저 검토한다.
- 기존 Playwright, axe, 디자인 대비 스크립트를 확장한다. 별도 접근성 프레임워크나 새 의존성은 추가하지 않는다.

### P0 — 출시 전 확인할 작업

| 순서 | 작업 | 실제 소유 파일 | 최소 변경 | 완료 조건 |
| ---: | --- | --- | --- | --- |
| 1 | 핵심 화면 400% 리플로우 matrix | `tests/design-audit-visual.spec.ts`, 기존 `*-mobile-responsive.spec.ts`와 `tests/support/*` | 기존 fixture와 이동 helper를 재사용해 Login, Profiles, Buckets, Objects, Uploads, Jobs, Settings를 `320 CSS px`에서 검사 | 비예외 영역의 페이지 수평 overflow 0, 핵심 CTA와 첫 콘텐츠 접근 가능, 주요 dialog/sheet 내부 기능 잘림 없음 |
| 2 | 독립 제어 타깃 크기 보정 | `src/components/appTabs.module.css`, 각 화면의 작은 icon action CSS | workspace 닫기 같은 독립 컨트롤을 최소 `24x24px`로 보장하고 인접 타깃 간격 확인 | 렌더링 bounding box가 `24x24px` 이상이거나 WCAG spacing/equivalent 예외가 테스트에 명시됨 |
| 3 | 포커스 비가림 회귀 검사 | `tests/accessibility-overlays.spec.ts`, `src/components/useOverlayLayer.ts`, `src/FullAppInner.module.css` | 공통 overlay 동작은 유지하고 sticky header/drawer가 활성 포커스를 가리는지만 E2E로 검사 | Tab/Shift+Tab 순회 중 활성 요소의 rect가 viewport와 현재 dialog rect 안에 있고, 닫은 뒤 trigger로 포커스 복귀 |

구현 순서는 **검사 추가 → 실제 실패 노드만 공통 소유 CSS에서 수정 → 동일 검사 재실행**으로 한다. 작은 크기 검색 결과를 일괄 확대하지 않는다. 장식 아이콘, switch 내부 thumb, 충분한 equivalent target은 수정 대상이 아니다.

### P1 — 다음 접근성 스프린트

| 순서 | 작업 | 실제 소유 파일 | 최소 변경 | 완료 조건 |
| ---: | --- | --- | --- | --- |
| 1 | 작은 정보 텍스트 정리 | `src/pages/profiles/ProfileModal.module.css`, `src/pages/ProfilesPage.module.css`, `src/pages/BucketsPage.module.css`, `src/pages/UploadsPage.module.css` | 사용자에게 의미가 있는 `9–11px` label/meta를 우선 `12–14px`로 조정; 순수 아이콘 크기는 제외 | `200%` text-only zoom에서 잘림·겹침 없이 읽히며, active informational text가 4.5:1 이상 |
| 2 | 실제 렌더링 대비 범위 확대 | `scripts/check-design-contrast.mjs`, `tests/accessibility-overlays.spec.ts` | 토큰 계산은 공통 조합만 유지하고 opacity/color-mix가 적용된 실제 활성 상태는 axe fixture로 추가 | light/dark의 Profile 편집, Objects 검색, warning/error/selected 상태에서 axe contrast 위반 0 |
| 3 | axe 페이지·상태 matrix 보강 | `tests/accessibility-overlays.spec.ts`, `tests/dark-theme-accessibility.spec.ts` | Login, empty, loading, error, disabled 상태 중 현재 빠진 대표 상태만 기존 suite에 추가 | 핵심 7개 화면의 대표 정상 상태와 주요 오류 상태가 light/dark 중 해당 가능한 테마에서 스캔됨 |

### P2 — 릴리스 후보 수동 검증

| 환경 | 사용자 작업 | 확인 항목 |
| --- | --- | --- |
| NVDA + Chrome | 로그인 → Objects 탐색 → 객체 선택 → 작업 메뉴 → Transfers 상태 확인 | 이름/역할/값, 읽기 순서, 상태 알림 중복 여부 |
| VoiceOver + Safari | 모바일 내비게이션 → Uploads → source sheet → 오류 복구 | rotor 탐색, dialog 진입/이탈, focus 복귀 |
| Windows High Contrast | 전역 탐색, 선택 행, 경고, 위험 작업 | 색 없이도 포커스·선택·오류 구분 가능 |
| Chrome/Firefox 200% text-only zoom | 7개 핵심 화면과 주요 overlay | 텍스트 잘림, 버튼 겹침, 기능 손실 없음 |

### 이번 범위에서 하지 않을 작업

- 단축키 설정 화면이나 단축키 재지정 시스템 추가
- advisory 60건의 기계적 일괄 수정
- 모든 작은 SVG/장식 아이콘을 터치 타깃으로 오인해 확대
- 현재 axe/Playwright와 중복되는 새 접근성 도구 도입

## 준수 판정 경계

이 리포트는 현재 로컬 소스, fixture 기반 Chromium 렌더링, axe와 Playwright 결과를 근거로 한다. 다음을 증명하지 않는다.

- 실제 운영 데이터와 모든 provider 조합
- Firefox/Safari의 전체 동작
- NVDA, JAWS, VoiceOver, TalkBack 실제 사용성
- OS 고대비/forced-colors 전체 호환성
- 모든 페이지 상태에 대한 WCAG 2.2 AA 인증

따라서 현재 판정은 **“접근성 기반은 양호하나, 1개 Level A 미충족과 수동 검증 공백 때문에 WCAG 2.2 AA 준수 미확정”**이다.

## 기준 문서

- [WCAG 2.2 W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [Understanding 2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)
- [Understanding 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [Understanding 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Understanding 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
