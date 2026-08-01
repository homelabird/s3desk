# S3Desk 디자인 개선 및 영향도 리포트

Date: 2026-08-01

Related: `COMPONENT_DESIGN_EVALUATION_2026-08-01.ko.md`

## 1. 목표

컴포넌트 평가에서 확인한 문제를 실제 구현 가능한 작업으로 변환하고, 각 변경이 사용자 경험·화면·코드·테스트에 미치는 영향을 평가한다.

이번 개선의 목표는 새 디자인 시스템을 만드는 것이 아니다. 현재 React, Ant Design, CSS token, 접근성 구조를 유지하면서 다음 결과를 만든다.

1. 사용자가 컨테이너보다 작업을 먼저 본다.
2. 모바일 첫 화면에 핵심 행동과 필수 입력이 함께 보인다.
3. 공통 컴포넌트 수정으로 여러 페이지를 한 번에 정리한다.
4. 위험한 폼과 데이터 동작은 변경하지 않는다.

## 2. 영향도 평가 방식

| 항목 | 의미 |
| --- | --- |
| 도달 범위 | 변경이 영향을 주는 route와 반복 노출 빈도, 1~5 |
| UX 개선도 | 작업 발견성·정보 위계·밀도 개선 정도, 1~5 |
| 영향 점수 | `도달 범위 × UX 개선도`, 최대 25 |
| 구현 비용 | S: 1~2개 파일, M: 3~6개 파일, L: 7개 이상 또는 복잡한 상태 분기 |
| 회귀 위험 | 시각 변화만 있으면 낮음, 반응형·조건부 렌더링은 중간, 행동 구조 변경은 높음 |

영향 점수는 우선순위를 정하기 위한 상대값이다. 개발 시간의 확정 추정치는 아니다.

## 3. 현재 파급 구조

- `PageHeader`: Profiles, Buckets, Uploads, Jobs의 4개 production 소비자
- `PageSection`: Uploads와 Jobs의 4개 production 소비 파일
- `BrandLockup`: bootstrap/login, desktop/mobile shell의 3개 production 소비 파일에서 모든 route에 노출
- `DialogModal`: 21개 production 소비 파일
- `OverlaySheet`: 15개 production 소비 파일
- `AppTabs`: Settings, Transfers, Bucket policy, Objects toolbar의 4개 production 소비 파일
- route: Profiles, Buckets, Objects, Uploads, Jobs와 Profiles로 연결되는 Settings
- Playwright: 61개 spec, 현재 24개 screenshot assertion

공통 컴포넌트는 작은 수정으로 넓은 효과를 내지만, modal/sheet는 소비자가 많아 전역 변경의 회귀 위험도 크다.

## 4. 개선 패키지와 영향도

| ID | 개선 패키지 | 도달 | UX | 영향 점수 | 비용 | 위험 | 우선순위 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| A | `PageHeader`·`PageSection` 평면화 | 5 | 5 | 25 | S | 중간 | P0 |
| B | `BrandLockup`을 wordmark 중심으로 정리 | 5 | 4 | 20 | S | 낮음 | P0 |
| C | 전역 header/sidebar 압축 | 5 | 4 | 20 | M | 중간 | P0 |
| D | Objects header/toolbar 2단 재배치 | 5 | 5 | 25 | M | 높음 | P0 |
| E | Profile 편집을 field-first로 변경 | 3 | 5 | 15 | M | 중간 | P1 |
| F | Bucket policy/governance 설명 스택 축소 | 2 | 5 | 10 | M | 중간 | P1 |
| G | Uploads 첫 viewport 압축 | 3 | 4 | 12 | S | 낮음 | P1 |
| H | Login을 form-first로 변경 | 3 | 4 | 12 | S | 낮음 | P1 |
| I | Jobs/Transfers의 불가능한 명령 숨김 | 3 | 3 | 9 | S | 중간 | P2 |
| J | modal/sheet chrome 평면화 | 4 | 3 | 12 | S | 중간 | P2 |
| Q | 시각 기준선 재승인 및 회귀 게이트 복구 | 5 | 0 | QA 필수 | M | 낮음 | 각 단계 종료 조건 |

### A. 공통 페이지 표면 평면화

변경 파일:

- `src/components/PageHeader.module.css`
- `src/components/PageSection.module.css`

구현:

- `PageHeader`의 gradient, shadow, 강한 외곽 border를 제거한다.
- 제목과 actions의 정렬은 유지하되 desktop padding을 줄인다.
- `PageSection` header의 gradient를 제거하고, section 전체 shadow를 기본값에서 제거한다.
- 독립된 입력·선택 surface가 필요한 소비자는 현재 page CSS에서만 border를 유지한다.

예상 효과:

- Profiles, Buckets, Uploads, Jobs가 동시에 덜 장식적이고 더 조밀해진다.
- 모바일에서 페이지별로 약 40~80px의 첫 화면 공간을 되찾을 수 있다.
- 공통 구조와 DOM은 유지하므로 기능 영향은 없다.

위험:

- Empty나 짧은 목록 화면이 지나치게 평평해 보일 수 있다.
- Jobs는 한 화면에서 `PageSection`을 여러 번 사용하므로 경계가 약해질 가능성이 가장 높다.

검증:

- 네 route의 light/dark desktop 화면
- Uploads·Jobs mobile 화면
- `PageHeader.test.tsx`, `PageSection.test.tsx`

### B. 브랜드 톤 정리

변경 파일:

- `src/components/BrandLockup.tsx`
- `src/components/BrandLockup.module.css`

구현:

- 기본 shell에서는 마스코트를 제거하고 `S3Desk` wordmark만 사용한다.
- `LOCAL DASHBOARD` subtitle은 bootstrap/login에서만 작은 보조문으로 허용한다.
- 새 이미지 asset이나 로고 시스템은 추가하지 않는다.

예상 효과:

- 로그인, 데스크톱 sidebar, 모바일 header의 제품 인상이 한 번에 정리된다.
- 엔터프라이즈 도구 UI와 캐릭터 이미지의 톤 충돌이 사라진다.
- 모바일 header 폭도 약 32~42px 줄일 수 있다.

위험:

- 기존 마스코트를 제품 정체성으로 보는 사용자에게는 개성이 줄었다고 느껴질 수 있다.
- 기능·접근성 영향은 없다. 이미지가 현재 `aria-hidden`이므로 이름 인식도 유지된다.

### C. 전역 shell chrome 압축

변경 파일:

- `src/FullAppShellChrome.tsx`
- `src/FullAppInner.module.css`

구현:

- desktop sidebar를 220px에서 192px 안팎으로 줄인다.
- 상단에는 profile selector와 Transfers만 상시 노출한다.
- Theme, Settings, Logout은 기존 `MenuPopover`에 모은다.
- mobile 44px touch target과 skip link는 유지한다.

예상 효과:

- 모든 인증 route에서 콘텐츠 폭과 첫 화면 높이가 개선된다.
- 전역 행동과 페이지 행동의 경쟁이 줄어든다.

위험:

- desktop에서 Settings·Logout 발견성이 한 단계 낮아진다.
- compact/stacked/desktop 세 viewport 분기의 테스트와 키보드 접근을 모두 확인해야 한다.

### D. Objects를 content-first로 재배치

변경 파일 후보:

- `src/pages/objects/ObjectsPageHeader.tsx`
- `src/pages/objects/ObjectsToolbarSection.tsx`
- `src/pages/objects/ObjectsToolbar.tsx`
- `src/pages/objects/ObjectsListControls.tsx`
- `src/pages/objects/ObjectsShell.module.css`

구현:

- 첫 행: bucket/path와 `Upload`, `New folder`만 둔다.
- 둘째 행: current-folder search, filter, search bucket, view, sort를 둔다.
- favorite, command palette 등 빈도가 낮은 행동은 기존 `Tools` 메뉴로 모은다.
- selection action은 기존 selection bar 소유권을 유지한다.
- action model이나 새 toolbar abstraction은 만들지 않는다.

예상 효과:

- 현재 1440×900 actual screenshot에서 약 y=393에 시작하는 목록을 y=320 이하로 올리는 것이 가능하다.
- 사용자가 Objects를 “도구 모음”이 아니라 “파일 목록”으로 먼저 인식한다.
- 가장 자주 사용하는 route의 체감 개선도가 가장 크다.

위험:

- responsive 분기와 lazy-loaded toolbar 경계가 있어 단순 CSS 변경만으로 끝나지 않는다.
- 버튼을 `Tools`로 이동할 때 권한·disabled reason·tooltip을 잃으면 기능 회귀다.
- 기존 `ObjectsPageHeader`, `ObjectsToolbar`, `ObjectsListControls`, mobile responsive 테스트를 모두 보존해야 한다.

### E. Profile 편집을 field-first로 변경

변경 파일 후보:

- `src/pages/profiles/ProfileModal.tsx`
- `src/pages/profiles/ProfileModalSections.tsx`
- `src/pages/profiles/ProfileProviderChecklist.tsx`
- `src/pages/profiles/ProfileModal.module.css`

구현:

- profile 소개 카드와 정상 상태 checklist를 기본 화면에서 축소한다.
- Endpoint, region, profile name 같은 기본 필드를 첫 viewport에 배치한다.
- checklist는 오류 또는 누락 필드가 있을 때만 상단 요약으로 표시한다.
- Advanced와 Security의 기존 접기/섹션 구조는 유지한다.

예상 효과:

- 현재 390×844 snapshot에서는 보이지 않는 첫 editable field가 첫 viewport에 들어온다.
- 신규 profile과 edit profile 모두 입력 시작 시간이 줄어든다.

위험:

- checklist는 단순 장식이 아니라 validation 상태를 전달한다. 숨기더라도 오류·누락 상태는 반드시 노출해야 한다.
- provider별 필드와 credential 보존 동작은 변경하지 않는다.

### F. Bucket policy와 governance를 작업 중심으로 축소

변경 파일 후보:

- `src/pages/buckets/BucketPolicyWorkspaceHeader.tsx`
- `src/pages/buckets/BucketPolicyContentTabs.tsx`
- `src/pages/buckets/BucketPolicyModal.module.css`
- `src/pages/buckets/BucketGovernanceModal.module.css`

구현:

- 현재 `Controls`와 `JSON policy` 탭을 탐색 구조로 사용한다.
- 선택되지 않은 경로를 설명하는 큰 카드는 제거한다.
- 상태 badge는 header 한 곳에 모으고 본문에서는 반복하지 않는다.
- delete policy와 irreversible governance 작업은 기존 danger confirmation을 유지한다.

예상 효과:

- 사용자가 설명 카드를 스크롤한 뒤에야 편집기를 보는 문제를 줄인다.
- provider별 설정이 문서 페이지가 아니라 작업 화면처럼 보인다.

위험:

- 보안·보존 정책 안내를 과도하게 줄이면 위험한 변경의 의미가 약해질 수 있다.
- destructive action 설명과 confirmation은 축소 대상이 아니다.

### G. Uploads 첫 viewport 압축

변경 파일:

- `src/pages/uploads/UploadsSelectionSection.tsx`
- `src/pages/UploadsPage.module.css`

구현:

- 현재 개선된 `Selection → Target & source` 순서는 유지한다.
- 선택 전에는 점선 empty preview를 렌더링하지 않는다.
- `Add from device…` CTA와 bucket 입력이 390×844 첫 viewport 안에 함께 보이도록 section 간격을 줄인다.
- 파일 선택 후에만 summary와 preview를 표시한다.

예상 효과:

- 빈 상태의 중복 안내가 사라지고, 파일 선택과 목적지 확인을 한 화면에서 시작할 수 있다.
- 과거 CTA 제거 회귀를 반복하지 않으면서 가장 작은 변경으로 효과를 낸다.

위험:

- `Add from device…` CTA는 항상 유지해야 한다.
- `selectedFiles.length === 0`일 때 section 전체를 숨기는 방식은 금지한다.

### H. Login을 form-first로 변경

변경 파일:

- `src/pages/LoginPage.module.css`
- `src/components/TokenLoginPanel.tsx`
- `src/components/TokenLoginPanel.module.css`

구현:

- B 패키지의 wordmark를 재사용한다.
- 필수 token 안내를 form helper text로 줄인다.
- `Clear stored token`과 긴 보안 설명은 저장 token이 있을 때만 보조 영역에 노출한다.
- 입력, Login, 오류 메시지는 항상 유지한다.

예상 효과:

- 단일 과업인 token 로그인이 첫 시선이 된다.
- 390px 모바일에서 브랜드와 안내 박스가 차지하는 높이를 줄인다.

위험:

- API token과 S3 credential의 차이는 보안상 중요하므로 완전히 삭제하지 않는다.

### I. Jobs와 Transfers의 상태 기반 명령 정리

변경 파일 후보:

- `src/components/transfers/TransfersDrawer.tsx`
- `src/pages/jobs/JobsToolbar.tsx`

구현:

- 완료 항목이 없으면 `Clear done`을 숨긴다.
- 항목이 전혀 없으면 clear 계열 행동을 모두 숨긴다.
- Jobs의 낮은 빈도 필터와 행동은 기존 overflow/menu 표면을 사용한다.

예상 효과:

- empty state에서 무의미한 command가 콘텐츠보다 먼저 보이지 않는다.

위험:

- 단순 disabled styling이 아니라 조건부 렌더링이므로 상태 조합 unit test가 필요하다.

### J. Modal과 Sheet chrome 평면화

변경 파일:

- `src/components/DialogModal.module.css`
- `src/components/OverlaySheet.module.css`

구현:

- gradient header를 단색 surface로 바꾼다.
- 원형 close button의 외곽선과 shadow를 줄인다.
- focus ring, 44px mobile target, sticky footer, safe-area padding은 유지한다.

예상 효과:

- 21개 DialogModal 소비 파일과 15개 OverlaySheet 소비 파일의 시각 무게가 동시에 낮아진다.

위험:

- 파급 범위가 넓다. Profile, Buckets, Objects, Jobs, Settings, Transfers를 모두 visual QA해야 한다.
- 기능 개선이 아니므로 P0/P1 흐름이 끝난 뒤 적용한다.

## 5. Route별 영향 매트릭스

| 개선 | Profiles | Buckets | Objects | Uploads | Jobs | Settings/Login |
| --- | --- | --- | --- | --- | --- | --- |
| A 공통 표면 | 높음 | 높음 | 낮음 | 높음 | 높음 | 낮음 |
| B 브랜드 | 높음 | 높음 | 높음 | 높음 | 높음 | 높음 |
| C shell chrome | 높음 | 높음 | 높음 | 높음 | 높음 | Settings 높음 |
| D Objects | 없음 | 없음 | 매우 높음 | 없음 | 없음 | 없음 |
| E Profile | 매우 높음 | 없음 | 없음 | 없음 | 없음 | Settings 중간 |
| F Policy | 없음 | 매우 높음 | 없음 | 없음 | 없음 | 없음 |
| G Uploads | 없음 | 없음 | 없음 | 매우 높음 | 없음 | 없음 |
| H Login | 없음 | 없음 | 없음 | 없음 | 없음 | Login 매우 높음 |
| I Jobs/Transfers | Transfers 중간 | Transfers 중간 | Transfers 중간 | Transfers 중간 | 매우 높음 | Transfers 중간 |
| J Overlay chrome | 높음 | 높음 | 높음 | 중간 | 높음 | 높음 |

## 6. 전체 영향 평가

### 사용자 영향

- 긍정: 핵심 행동 발견성, 첫 viewport 효율, 데이터 밀도, 제품 신뢰감이 개선된다.
- 부정 가능성: Settings·Logout 같은 저빈도 행동을 메뉴로 옮기면 한 번 더 클릭해야 한다.
- 기능 변화: 없음이 원칙이다. 버튼 위치와 설명 노출 방식만 바꾸고 API·권한·상태 모델은 유지한다.

### 코드 영향

- 공통 CSS 변경은 코드량을 늘리기보다 삭제하는 작업이다.
- Objects와 Profile은 상태·권한 분기를 보존해야 하므로 JSX 변경이 필요하다.
- 새 dependency, 새 theme layer, 새 action registry, 새 responsive framework는 필요 없다.

### 성능 영향

- JS bundle 증가는 없어야 한다.
- gradient와 shadow 감소로 paint 비용은 같거나 소폭 줄어든다.
- 이미지 마스코트를 shell에서 제거하면 반복 이미지 decode/display 비용이 소폭 줄 수 있으나 성능 개선을 주목적으로 주장하지 않는다.

### 접근성 영향

- semantic heading, tab, dialog, focus trap, live region은 변경하지 않는다.
- icon-only 또는 menu 이동 행동에는 현재 accessible name과 disabled reason을 유지한다.
- 44px mobile target, focus-visible ring, danger confirmation은 축소하지 않는다.

### 보안·운영 영향

- API token, credential, bucket policy, retention 동작 자체에는 영향이 없어야 한다.
- 보안 설명은 축약할 수 있지만 API token과 S3 credential 구분 및 destructive warning은 유지한다.

### QA 영향

- 현재 `npm run test:e2e:design-audit`가 2/6만 통과하므로 기준선이 이미 drift된 상태다.
- 디자인 변경 전에 기존 baseline을 무조건 덮어쓰면 현재 회귀와 의도된 변경을 구분할 수 없다.
- 각 phase의 actual screenshot을 수동 검토한 후 해당 phase와 관련된 snapshot만 승인한다.

## 7. 실행 순서

### Phase 0. 기준선 정리

1. 현재 4개 visual mismatch의 actual/diff를 보존한다.
2. mismatch가 최근 의도된 변경인지 테스트 fixture 문제인지 분류한다.
3. baseline을 일괄 업데이트하지 않는다.

종료 조건:

- Objects light/dark/bucket picker와 Uploads mobile의 차이가 설명되어 있다.
- 변경 전 actual이 비교 근거로 남아 있다.

### Phase 1. 공통 인상 개선

작업: A → B → C

이 순서를 권장하는 이유:

- A와 B는 작은 변경으로 거의 모든 화면의 인상을 바꾼다.
- C는 responsive 동작 위험이 있으므로 공통 표면 수정 후 별도 검증한다.

종료 조건:

- Profiles, Buckets, Uploads, Jobs desktop light/dark QA 통과
- shell desktop/tablet/mobile geometry QA 통과
- 공통 컴포넌트 unit test, typecheck, build 통과

### Phase 2. 핵심 작업 화면 개선

작업: D → G

종료 조건:

- 1440×900 Objects 목록 시작점 y≤320px
- 390×844 Uploads에서 `Add from device…`와 bucket 입력이 첫 viewport에 완전히 표시
- Objects long-key list/grid와 mobile controls에 기능 손실 없음

### Phase 3. 복잡한 설정 흐름 개선

작업: E → F → H

종료 조건:

- Profile 편집 첫 필드가 390×844 첫 viewport에 표시
- 누락·오류 checklist는 계속 노출
- Bucket policy에서 선택한 편집 surface가 설명 카드보다 먼저 표시
- Login token 의미와 오류 상태가 유지

### Phase 4. 보조 표면과 closeout

작업: I → J → Q

종료 조건:

- empty Transfers에 clear command가 없음
- modal/sheet focus·close·safe-area 회귀 없음
- 승인된 snapshot과 현재 구현이 일치

## 8. 권장 커밋 단위

1. `style(ui): flatten shared page surfaces`
2. `style(brand): simplify app lockup`
3. `style(shell): reduce global chrome`
4. `refactor(objects): prioritize object content`
5. `refactor(uploads): compress empty selection flow`
6. `refactor(profiles): show connection fields first`
7. `refactor(buckets): focus policy workspaces`
8. `style(auth): prioritize token form`
9. `fix(activity): hide unavailable clear actions`
10. `style(overlays): reduce modal chrome`
11. `test(visual): approve design baselines`

커밋 메시지는 작업 경계 예시이며 아직 생성된 커밋이 아니다.

## 9. 검증 계획

각 phase에서 최소한 다음을 실행한다.

```bash
npm run check:design
npm run typecheck
npm run build
npm run test:e2e:design-audit
git diff --check
```

영향 surface에 따라 다음을 추가한다.

- `npm run test:e2e:visual`
- `npm run test:e2e:mobile-responsive`
- touched component의 Vitest test
- light/dark desktop 수동 비교
- 768×1024 tablet 수동 비교
- 390×844 mobile 수동 비교

snapshot은 테스트를 통과시키기 위해 자동 승인하지 않는다. 실제 개선 목표와 기능 상태를 수동 확인한 뒤 갱신한다.

## 10. 완료 판정 기준

다음 항목이 모두 충족되어야 디자인 개선 완료로 본다.

- P0~P2 대상의 구현 또는 명시적인 제외 결정이 기록되어 있다.
- 모든 route에서 핵심 CTA가 한 화면에 과도하게 중복되지 않는다.
- Objects desktop 목록과 Uploads/Profile mobile 첫 viewport 목표가 충족된다.
- 권한, disabled reason, validation, destructive warning이 유지된다.
- light/dark/mobile 시각 증거가 현재 소스와 일치한다.
- `npm run check:design`, typecheck, build가 통과한다.
- 관련 visual/mobile 테스트가 통과한다.
- baseline 변경은 실제 검토된 UI 변경만 포함한다.

## 11. 하지 말아야 할 작업

- Ant Design 교체
- 새 UI library 또는 CSS framework 도입
- token 체계 전면 재작성
- 한 종류의 버튼을 위해 action registry나 factory 추가
- Profile/Policy 보안 설명과 confirmation 제거
- 의도 확인 없이 모든 visual snapshot 일괄 갱신

현재 코드에는 필요한 primitive가 이미 있다. 가장 효과적인 경로는 공통 표면에서 장식을 빼고, 각 페이지에서 중복 설명과 저빈도 행동을 줄이는 것이다.

## 12. 구현 및 검증 결과

2026-08-01에 P0~P2 실행 범위를 다음과 같이 반영했다.

| 패키지 | 결과 |
| --- | --- |
| A | `PageHeader`와 `PageSection`의 gradient·shadow·과한 padding을 제거하고 기존 heading/action DOM을 유지했다. |
| B | shell과 login의 마스코트를 제거하고 기존 `BrandLockup`을 wordmark 중심으로 단순화했다. |
| C | desktop sidebar를 192px로 줄이고 Theme·Settings·Logout을 기존 App menu로 통합했다. |
| D | Objects desktop toolbar를 한 행으로 합치고 목록 제어 시작점 `y ≤ 320` 회귀 assertion을 추가했다. |
| E | 현재 `ProfileModal`이 이미 Connection/Credentials 필드부터 시작하고 checklist를 렌더링하지 않아 추가 JSX 변경을 하지 않았다. 390×844 visual에서 첫 필드 노출을 재확인했다. |
| F | Bucket policy의 Recommended/Advanced 대형 카드 두 개를 짧은 경로 요약으로 교체했다. destructive warning과 confirmation은 유지했다. |
| G | 파일이 없을 때 중복 점선 preview를 렌더링하지 않되 `Add from device…` CTA는 항상 유지했다. bucket과 prefix 입력의 첫 viewport 포함 assertion을 추가했다. |
| H | 필수 token 안내를 helper text로 줄이고 저장 token이 있을 때만 clear 행동을 노출했다. API token과 S3 credential 구분 문구는 유지했다. |
| I | 완료 항목이 없는 Transfers에서 `Clear done`을, clear 가능한 항목이 없을 때 `Clear all`을 숨겼다. Jobs는 이미 primary action과 기존 `More job actions`가 분리되어 있어 추가 구조를 만들지 않았다. |
| J | `DialogModal`과 `OverlaySheet`를 단색 surface와 낮은 shadow로 평면화했다. mobile 44px close target과 safe-area/footer 규칙은 유지했다. |
| Q | 실제 light/dark/tablet/mobile 캡처를 수동 검토한 뒤 영향받은 snapshot만 갱신했다. |

현재 검증 결과:

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- `npm run check:design`: 통과
- 관련 Vitest: 통과
- 전체 Vitest: 1009개 중 1007개 통과; `useObjectsDnd` 2건이 전체 병렬 부하에서 5초 timeout이었고 동일 파일 단독 재실행은 4/4 통과
- `npm run test:e2e:visual -- --workers=1`: 25/25 통과
- `npm run test:e2e:design-audit`: visual 전체 실행에 포함되어 6/6 통과
- mobile responsive 전체 실행: 82/84 통과 후 삭제된 빈 preview 문구 assertion을 갱신했고, 영향 spec을 iPhone 13·Pixel 7에서 8/8 재실행 통과
- desktop Settings App menu 인증 흐름: 1/1 통과

기능 모델, API, 권한, credential 보존, destructive confirmation은 변경하지 않았다. 추가 dependency나 새 action abstraction도 도입하지 않았다.
