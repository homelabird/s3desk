# Frontend Feature Friction Audit Round 15 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Settings 모바일 흐름으로 직접 확인했다. 이번 라운드는 Settings > Transfers 첫 화면에서 `Downloads and previews: Use server proxy`가 구현 세부사항과 함께 노출되어 일반 사용자가 불필요하게 네트워크 라우팅 결정을 해야 하는 문제를 5개 반복 사이클로 분석하고 개선했다.

## Reference Practices

- [Microsoft Progressive Disclosure Controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 기본 UI는 essential에 집중하고, 추가 옵션은 필요할 때 드러내는 기준을 적용했다.
- [Microsoft UX Checklist](https://learn.microsoft.com/en-us/windows/win32/uxguide/top-violations): 설정은 필요한 속성만 두고, 기술이 아니라 사용자 목표 관점으로 설명해야 한다는 기준을 적용했다.
- [GOV.UK Service Manual - Designing good questions](https://www.gov.uk/service-manual/design/designing-good-questions): 질문과 도움말은 사용자가 이해할 수 있게 단순화하고, 일부 사용자에게만 필요한 도움말은 펼침 패턴으로 제공하는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- Playwright 모바일 캡처에서 Transfers 탭 첫 화면에 서버 프록시 스위치가 바로 노출됐다.
- 설명 문구가 `/download-proxy`, CORS, presigned URL 같은 구현 세부사항을 포함해 일반 사용자가 선택 결과를 판단하기 어려웠다.
- 같은 화면 아래의 성능 튜닝은 이미 접혀 있었지만, 프록시 강제 옵션은 사실상 troubleshooting용 고급 설정인데 기본 액션처럼 보였다.

### Action

- 개선 범위를 Settings > Transfers 섹션과 해당 unit/e2e/a11y 테스트로 제한했다.
- 기능 자체는 유지하되 기본 화면에서 제거하고, 고급 옵션 안에서만 접근하도록 결정했다.

## Cycle 2 - Compare Against Design Practices

### Finding

전송 라우팅 강제 스위치는 대부분의 사용자에게 “지금 설정해야 하는 값”이 아니라 문제가 생겼을 때만 필요한 복구/진단 옵션이다. 기본 화면에 두면 사용자는 다운로드가 동작하는 상황에서도 CORS나 proxy 선택을 고민하게 된다.

### Action

- 기본 Transfers 탭은 자동 다운로드 라우팅과 업로드 튜닝이 기본으로 동작한다는 요약만 보여주도록 변경했다.
- 고급 진입점 이름을 `Transfer performance tuning`에서 더 넓고 명확한 `Advanced transfer options`로 바꿨다.

## Cycle 3 - Move Proxy Control Into Advanced Options

### Finding

기존 `Downloads and previews: Use server proxy` 문구는 기능 중심이지만, 사용자에게 왜 켜야 하는지 충분히 말하지 못했다.

### Action

- 프록시 스위치를 `Advanced transfer options` 안으로 이동했다.
- 라벨을 `Force server proxy for downloads and previews`로 바꿔 기본 자동 라우팅을 덮어쓰는 동작임을 명확히 했다.
- 도움말을 “direct downloads fail in this browser” 같은 사용자 관찰 가능한 조건으로 다시 썼고, 내부 경로와 CORS 세부 설명은 기본 화면에서 제거했다.

## Cycle 4 - Mobile Interaction And Regression

### Finding

고급 옵션을 열 때 애니메이션 중간 상태를 캡처하면 항목이 흐리게 보일 수 있었다. 테스트가 switch 존재만 확인하면 실제 사용 가능한 expanded 상태를 충분히 보장하지 못한다.

### Action

- Settings 모바일 Playwright 테스트에 고급 옵션이 실제 expanded 상태인지 확인하는 helper를 추가했다.
- 부모 opacity가 안정된 뒤 switch 높이를 확인하도록 보강해 캡처와 테스트 기준을 실제 사용자 화면에 맞췄다.
- iPhone 13, Pixel 7 Settings 모바일 전체 흐름을 통과시켰다.

## Cycle 5 - Accessibility, Build, And Documentation

### Finding

고급 옵션으로 이동한 기능은 여전히 접근 가능해야 하며, Settings drawer의 accessibility scan도 새 구조를 기준으로 검사해야 한다.

### Action

- mobile Settings drawer axe 테스트가 `Advanced transfer options`를 열고 프록시 스위치를 검사하도록 갱신했다.
- SettingsPage unit test에서 프록시 스위치가 기본 화면에 없고 고급 옵션을 연 뒤 저장되는지 확인했다.
- 이번 리포트에 직접 확인한 문제, 참고 디자인 기준, 개선 결과, 검증 명령을 기록했다.

## Resulting UX Changes

- Transfers 탭 첫 화면에서 troubleshooting용 프록시 강제 스위치와 기술 설명이 사라졌다.
- 기본 화면은 자동 라우팅/자동 튜닝이 기본이라는 짧은 안내와 고급 옵션 진입점만 제공한다.
- 프록시 강제 설정은 `Advanced transfer options` 안에서 계속 사용할 수 있다.
- 고급 옵션 설명은 내부 구현 대신 사용자가 관찰할 수 있는 실패 조건 중심으로 바뀌었다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/__tests__/SettingsPage.test.tsx`
- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "settings drawer persists transfer preferences"`
- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "mobile Settings drawer has no axe violations"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Advanced transfer options` 안에는 아직 많은 upload tuning 수치가 한 번에 펼쳐진다. 실제 사용자 테스트에서 고급 사용자가 아닌 사람이 이 영역을 자주 열고 혼란을 겪는다면 upload tuning을 별도 하위 disclosure로 더 나눌 수 있다.
- `Transfers` 탭 자체가 일반 사용자의 상시 설정인지, troubleshooting 중심인지 더 관찰할 필요가 있다. 사용 빈도가 낮으면 Support 탭 안의 전송 진단 섹션으로 이동하는 방안도 검토할 수 있다.
