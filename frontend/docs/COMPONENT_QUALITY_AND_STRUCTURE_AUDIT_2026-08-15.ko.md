# S3Desk 프론트엔드 컴포넌트 품질·구조 감사

날짜: 2026-08-15

## 결론

S3Desk 프론트엔드는 공용 shell, native form control, dialog/sheet focus 관리, 반응형 카드 전환과 실제 브라우저 회귀 검증이 잘 갖춰져 있다. 대비·리플로우·핵심 overlay에서 즉시 사용을 막는 P0 결함은 재현되지 않았다.

이번 감사에서 인증 후 route 페이지가 `h2`부터 시작하고 일부 하위 section이 `h3`로 이어지는 공통 heading 결함을 확인했다. 공용 `PageHeader`, 별도 Objects header, 공용 `PageSection`의 실제 소유 지점에서 `h1 → h2` 구조로 고쳤고 기존 시각 크기는 유지했다. Login과 bootstrap 오류 화면은 기존에도 `BrandLockup titleAs="h1"`을 사용했다.

가장 큰 구조 위험은 Objects의 기능 수 자체가 아니라 변경 경로가 217개 소스 파일과 약 26K LOC에 걸쳐 있다는 점이다. 다만 pane, overlay, virtualization, provider operation, preview의 lazy 경계는 실제 책임과 테스트가 있으므로 파일 수만 근거로 합치는 작업은 하지 않았다.

## 범위와 증거 등급

감사한 활성 표면:

- 인증 전 Login
- `/profiles`, `/buckets`, `/objects`, `/uploads`, `/jobs`
- `/settings`가 여는 Profiles 기반 Settings drawer
- 전역 shell/navigation, Transfers runtime/drawer, 공용 dialog/sheet/menu/tab/tree

사용한 증거:

- `FullAppRoutes.tsx`에서 실제 route와 lazy entry 추적
- route entry → state/controller → shell/view → overlay 호출 흐름 검토
- 현재 worktree diff와 삭제·수정 파일 확인
- 소스 파일·LOC·테스트 파일 수와 import-cycle gate
- 디자인 토큰·패턴·대비 정적 gate
- Vitest 공용 heading 회귀 검사
- Chromium Playwright 시각 baseline, axe, focus, reflow, target geometry fixture

증거 경계:

- 소스/정적 결과는 실제 렌더링 적합성을 단독으로 증명하지 않는다.
- axe는 자동 규칙 범위이며 NVDA, VoiceOver, TalkBack 작업 완료를 증명하지 않는다.
- Playwright 결과는 현재 Chromium과 deterministic fixture 범위다.
- provider 실데이터, authenticated protected runtime, reverse proxy, 배포 및 production 품질 증거가 아니다.
- Firefox 실제 text-only zoom, Safari/VoiceOver, physical mobile safe-area는 이번 실행 범위 밖이다.

## 활성 구조 인벤토리

| 화면군 | 실제 조립 경로 | 소스 규모 | 구조 특성 |
| --- | --- | ---: | --- |
| 전역 shell | `FullAppInner` → `FullAppShellChrome` / `FullAppContentHost` / `FullAppOverlaysHost` | import gate 전체 `551` files, `1,147` runtime edges | navigation, route, settings, transfer 책임이 분리됨 |
| Login/bootstrap | `FullAppBootstrapGate` → `LoginPage` → `TokenLoginPanel` | 핵심 3 files / 274 lines | native form submit, token validation, error recovery와 기존 `h1`을 소유 |
| Profiles | `ProfilesPage` → `useProfilesPageState` → `ProfilesPageShell` | 33 files / 5,258 lines / 18 unit-test files | 연결·검증·YAML·provider form 상태가 큼 |
| Buckets | `BucketsPage` → `useBucketsPageState` → `BucketsPageRouteShell` → `BucketsPageShell` | 69 files / 9,619 lines / 19 unit-test files | AWS/GCS/Azure/OCI policy·governance 분기가 주 복잡도 |
| Objects | `ObjectsPage` → `ObjectsPageScreen` → data/actions/composition → pane/overlay hosts | 216 files / 26,029 lines / 73 unit-test files | 고밀도 탐색, virtual list, tree, preview, overlay와 provider operation 결합 |
| Uploads | `UploadsPage` → `UploadsPageExperience` → state/presentation → `UploadsPageShell` | 12 files / 801 lines / 9 unit-test files | source 선택과 destination/queue 경계가 비교적 작음 |
| Activity | `JobsPage` → controller → route shell → page shell/overlays | 40 files / 6,971 lines / 31 unit-test files | realtime, filters, logs, retry와 provider 상태가 주 복잡도 |
| Settings | Settings drawer → section lazy loading | 6 files / 702 lines / 1 direct unit-test file | 공용 form primitive와 각 domain 설정을 재사용 |

규모는 결함 판정이 아니라 변경 경로와 감사 우선순위를 정하는 보조 지표로만 사용했다.

## 화면군별 점수

각 축은 10점 만점이다. 감점은 아래 finding 및 인벤토리 근거와 연결한다.

| 화면군 | 구조 | 가시성·정보 위계 | 웹표준·접근성 | 반응형·상태 | 유지보수성 | 근거 요약 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 전역 shell/overlay | 8 | 8 | 9 | 9 | 8 | named nav, skip link, focus trap·복귀, compact header가 있음. Settings/Transfers 상태 연결은 길지만 소유권은 분리됨 |
| Profiles | 8 | 8 | 9 | 9 | 8 | desktop table/mobile card, edit/import overlay axe 근거가 있음. provider form·YAML 경로 때문에 단순 CRUD보다 변경 면적이 큼 |
| Buckets | 7 | 8 | 9 | 9 | 7 | table/card와 policy/governance overlay 근거가 강함. 4개 provider의 create/policy/governance 분기로 파일·prop 계약이 큼 |
| Objects | 6 | 8 | 9 | 9 | 6 | desktop/tablet/320px, light/dark, focus·overlay 근거가 강함. 216 files와 pane/action/view-model 전달 경로가 가장 김 |
| Uploads/Transfers | 8 | 8 | 9 | 9 | 8 | source sheet, queue, Transfers drawer의 역할이 분명함. presentation 변환은 남아 있으나 현재 작은 domain 경계와 맞음 |
| Activity | 7 | 8 | 9 | 9 | 7 | operational alerts, mobile filters/log/details 상태가 검증됨. controller → route shell → page shell 전달 단계와 6.9K LOC가 변경 비용을 높임 |
| Settings/Login | 8 | 8 | 9 | 9 | 8 | native 입력, token recovery, narrow reflow, dark axe 근거가 있음. 실제 보조기술과 OS high contrast 수동 증거는 없음 |

평균 점수는 합격 선언에 사용하지 않았다. 예를 들어 Objects는 브라우저 품질이 높아도 구조 변경 비용이 큰 별도 위험을 유지한다.

## Findings

### CQ-01 — 페이지 heading 구조가 `h2`부터 시작함

- 심각도: P1
- 분류: native/표준 기능 사용 + 최소 수정
- 영향: screen reader heading 탐색과 문서 outline의 예측 가능성이 낮아짐
- 근거: 감사 전 frontend source에 `h1`이 없었고 공용 `PageHeader` 기본값과 Objects 전용 header가 모두 level 2였음
- 추가 재현: `PageHeader`를 `h1`로 바꾼 뒤 axe가 Uploads의 `Selection`, Activity의 `History`에서 `h1 → h3` heading-order 위반을 검출함

개선:

- `PageHeader` 기본 제목을 `h1`로 변경
- Objects 전용 제목을 `h1`로 변경
- `PageSection` 제목을 `h2`로 변경
- 기존 h2/h3 시각 크기를 CSS에서 유지해 정보 위계와 screenshot baseline을 보존
- 공용 unit assertions를 heading level에 맞게 변경하고 Objects header assertion 추가

### CQ-02 — 순수 전달 composition wrapper가 변경 경로를 늘림

- 심각도: P2
- 분류: 삭제 / 기존 요소 재사용
- 영향: 페이지 조립을 추적할 때 실제 상태 소유권 없이 파일과 props hop만 추가됨
- 근거: 감사 시작 시 worktree에는 Profiles, Buckets, Uploads, Transfers의 한 번 쓰이는 composition/provider view wrapper와 그 wrapper 전용 테스트를 제거하는 사용자 변경이 이미 존재했음
- 판정: 방향은 현재 state hook과 shell을 직접 연결해 추적 경로를 줄이므로 타당함
- 소유권 경계: 이 감사에서 해당 사용자 변경을 다시 작성하거나 되돌리지 않았으며, 이번 개선으로 귀속하지 않음

### CQ-03 — Objects는 높은 기능 응집도와 긴 조립 경로가 함께 존재함

- 심각도: P2
- 분류: 보류
- 영향: 작은 UI 변경도 data/action/selection/pane/overlay view-model을 함께 추적해야 할 수 있음
- 근거: 216 source files, 26,029 lines, 73 unit-test files. `ObjectsPageScreen`에서 data, actions, preview, viewport, composition을 조립하고 composition이 list/toolbar/overlay/pane으로 다시 분기함
- 유지 근거: tree/list/details host는 lazy fallback, dock/drawer 또는 virtualization 책임을 실제로 소유함. `useObjectsScreenComposition`도 네 하위 domain 경계를 한 곳에서 조립하므로 현재는 단순 pass-through가 아님
- 개선 기준: 실제 변경에서 동일 props 묶음을 세 단계 이상 수정해야 하거나 한 번 쓰이는 전달-only owner가 새로 확인될 때만 삭제

후속 개선:

- `ObjectsContextMenuPortalHost`는 caller가 `ObjectsPagePanes` 하나뿐이고 자체 state, effect, layout 없이 visible/null guard와 `Suspense`만 전달하는 것으로 측정됨
- host 파일을 삭제하고 동일 lazy portal 경계를 `ObjectsPagePanes`에 인라인함
- hidden 상태에서는 mount하지 않고 runtime props가 준비된 경우에만 mount하는 회귀 검사를 추가함
- import graph가 `552 files / 1,148 runtime edges`에서 `551 / 1,147`로 감소함

### CQ-04 — Buckets와 Activity route shell은 얇지만 현재 의미가 있음

- 심각도: P3
- 분류: 보류
- 근거: 둘 다 한 caller만 가지지만 profile-required gate와 shell의 non-null `profileId` 계약을 소유하고 해당 gate 테스트가 있음
- 판정: 파일 수만 줄이기 위해 page entry에 합치면 gate 테스트와 nullable 경계가 섞인다. 실제 중복 변경 비용이 측정되기 전에는 유지한다.

### CQ-05 — 디자인 advisory 58건은 자동 결함이 아님

- 심각도: P3 review inventory
- 분류: 보류
- 근거: `check:design`은 50 CSS files / 99 tokens와 모든 추적 light/dark 대비 조합을 통과함. 58건은 transparent background, compact radius, opacity, removed shadow 검토 알림임
- 판정: selectable/floating surface의 hierarchy가 실제 screenshot과 geometry에서 실패하지 않은 항목은 스타일 취향으로 간주하고 수정하지 않음

## 적용된 개선 범위

이번 감사에서 직접 수정한 파일:

- `frontend/src/components/PageHeader.tsx`
- `frontend/src/components/PageHeader.module.css`
- `frontend/src/components/PageSection.tsx`
- `frontend/src/components/__tests__/PageHeader.test.tsx`
- `frontend/src/components/__tests__/PageSection.test.tsx`
- `frontend/src/pages/objects/ObjectsPageHeader.tsx`
- `frontend/src/pages/objects/ObjectsShell.module.css`
- `frontend/src/pages/objects/__tests__/ObjectsPageHeader.test.tsx`
- `frontend/src/pages/objects/ObjectsPagePanes.tsx`
- `frontend/src/pages/objects/ObjectsContextMenuPortalHost.tsx` 삭제
- `frontend/src/pages/objects/__tests__/ObjectsPagePanes.test.tsx`
- `frontend/docs/COMPONENT_QUALITY_AND_STRUCTURE_AUDIT_2026-08-15.ko.md`

새 dependency, 새 abstraction, 새 평가 framework, snapshot 갱신은 추가하지 않았다.

## 현재 검증 결과

```text
npm --prefix frontend run check:design
  pass
  CSS token: 50 files / 99 tokens
  design advisory: 58 non-blocking review prompts
  tracked light/dark contrast pairs: pass

npm --prefix frontend run test:unit -- \
  src/components/__tests__/PageHeader.test.tsx \
  src/components/__tests__/PageSection.test.tsx \
  src/pages/objects/__tests__/ObjectsPageHeader.test.tsx
  3 files / 6 tests passed

npm --prefix frontend run test:unit -- --maxWorkers=4
  252 files / 1,030 tests passed

npm --prefix frontend run typecheck
  pass

npm --prefix frontend run lint
  pass
  CSS token and import-cycle gates included
  import cycle: 551 files / 1,147 runtime edges, pass

npm --prefix frontend run test:e2e -- \
  tests/objects-mobile-responsive.spec.ts \
  --project=mobile-iphone-13 \
  --grep "opens and dismisses object action menus on mobile rows"
  1 passed

npm --prefix frontend run test:e2e:design-audit
  10 passed
  light/dark/tablet/320px Objects, bucket picker, Jobs, Uploads, Profiles, Buckets

npm --prefix frontend run test:e2e -- tests/wcag-reflow.spec.ts --project=chromium
  7 passed
  Login, Profiles, Buckets, Objects, Uploads, Jobs, Settings
  rendered targets below 24/44/48px: 0 in measured fixtures

npm --prefix frontend run test:e2e -- \
  tests/accessibility-overlays.spec.ts \
  tests/dark-theme-accessibility.spec.ts \
  --project=chromium
  final run: 43 passed
  whole-page, overlay, focus, forced-colors, light/dark fixture coverage

git diff --check
  pass
```

첫 visual 실행은 heading semantic 변경이 Ant Design 기본 h1 크기도 바꿔 6개 screenshot을 실패시켰다. snapshot을 갱신하지 않고 기존 h2 크기를 명시한 뒤 동일 suite 10/10을 통과시켰다.

## 남은 우선순위 backlog

### P2 — 실제 변경 단위로 Objects 전달-only 계층 계속 측정

- 첫 측정 단위인 `ObjectsContextMenuPortalHost` 제거는 완료했다.
- 동일 props 묶음이 세 단계 이상 반복 수정되는 사례를 변경 이력에서 수집한다.
- 측정된 사례의 실제 공용 owner 한 곳만 줄인다.
- lazy loading, portal, virtualizer, dock/drawer 경계를 단순 파일 수 감소 목적으로 합치지 않는다.

### P2 — 수동 보조기술과 실제 확대 증거

- NVDA + Chrome 또는 VoiceOver + Safari에서 로그인, 객체 action menu, 업로드 queue, 오류 복구를 수행한다.
- Firefox text-only 200%와 실제 browser zoom 400%에서 긴 S3 key, policy editor, logs drawer를 확인한다.

### P3 — Buckets/Activity route shell 재평가 조건

- profile gate와 shell 계약이 함께 변경되는 반복 사례가 생길 때 page entry로 합치는 편이 더 작은지 재평가한다.
- 현재는 nullable 경계와 gate test가 있으므로 유지한다.

## 완료 판정 경계

이번 범위에서 활성 화면군 인벤토리, 5축 점수, owner가 연결된 finding, 공통 heading 개선, 정적·unit·Chromium visual/reflow/axe 검증을 확보했다. P0는 없으며 확인된 P1은 수정됐다.

다만 본 문서는 WCAG 전체 준수 인증이나 production 품질 인증이 아니다. 수동 보조기술, 실제 browser zoom, 타 엔진, provider 실데이터와 protected deployment 검증은 위 backlog와 증거 경계에 남긴다.
