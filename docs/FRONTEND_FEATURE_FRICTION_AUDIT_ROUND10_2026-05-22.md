# Frontend Feature Friction Audit Round 10 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright 모바일 Profiles 흐름, Profiles 접근성 스캔, visual regression으로 직접 확인하고, 신규 사용자의 첫 설정 화면에 운영자/진단용 기능이 과하게 보이는지 검토했다. 이번 라운드는 Profiles 온보딩 카드의 `System readiness`, 비대화형 disabled checkbox, 활성화되지 않은 다음 화면 링크, CTA 우선순위를 5개 반복 사이클로 개선했다.

## Reference Practices

- [Microsoft UX checklist](https://learn.microsoft.com/en-us/windows/win32/uxguide/top-violations): 작업을 완료하게 하는 버튼은 구체적 동사로 시작하고, 불필요한 wizard/setup 단계는 줄이며, 사용자가 실제로 해야 하는 결정을 먼저 보여주는 기준을 적용했다.
- [Microsoft progressive disclosure controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 드물거나 일부 사용자에게만 필요한 추가 정보는 기본 화면에 모두 펼치지 않는 기준을 적용했다.
- [GOV.UK designing good questions](https://www.gov.uk/service-manual/design/designing-good-questions): 사용자가 이해하는 질문/라벨을 쓰고, 도움말은 필요한 위치에 짧게 제공하며, 인터페이스 자체를 설명해야 할 정도로 복잡하게 만들지 않는 기준을 적용했다.
- [Material Design empty states](https://m1.material.io/patterns/empty-states.html): 빈 상태와 온보딩은 사용자가 무엇을 할 수 있게 되는지 짧게 알려주고, 필요하면 건너뛸 수 있어야 한다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `profiles-mobile-responsive` Playwright 기준 흐름은 통과했지만, Profiles 온보딩에는 `System readiness`, `Backend connected`, `Transfer engine detected (rclone)`처럼 신규 사용자보다 운영자/개발자에게 가까운 문구가 남아 있었다.
- 프로필 생성/선택 진행 상태가 disabled checkbox로 표시되어, 실제로 누를 수 있는 입력인지 상태 표시인지 구분이 약했다.
- 프로필이 없거나 선택되지 않았을 때도 `Buckets`와 `Objects` 링크가 disabled 상태로 보이는 구조는 다음 행동을 명확히 줄이기보다 막힌 기능처럼 느껴질 수 있었다.

### Action

- 개선 범위를 Profiles 온보딩 카드와 관련 unit/e2e 검증으로 좁혔다.
- 기능 제거가 아니라 온보딩의 정보 구조, 상태 표현, CTA 우선순위를 조정하는 방향으로 결정했다.

## Cycle 2 - Setup Progress Instead Of Disabled Inputs

### Finding

체크박스는 일반적으로 사용자가 조작하는 입력이다. 온보딩 카드의 disabled checkbox는 상태 표시 의도는 맞지만, 신규 사용자가 “왜 눌리지 않지?”라고 해석할 수 있다.

### Action

- `Create a storage profile`, `Choose the active profile`을 checkbox가 아닌 `Setup progress` 목록으로 변경했다.
- 각 단계는 `Done`, `Next`, `Needed` 상태 텍스트와 아이콘으로 표시되도록 했다.
- 단위 테스트도 체크박스 존재가 아니라 진행 단계와 다음 링크 노출 여부를 검증하도록 보강했다.

## Cycle 3 - Connection Checks Copy

### Finding

`System readiness`는 이전 Settings 라운드에서 정리한 `System` 탭과 같은 문제를 가진다. 사용자는 첫 설정 화면에서 백엔드나 rclone 같은 구현 세부사항보다 “앱이 지금 연결 가능한가”를 알고 싶다.

### Action

- `System readiness`를 `Connection checks`로 바꿨다.
- 문제가 있을 때만 `Connection checks need attention`으로 열리게 했다.
- `Backend connected`는 `S3Desk server is reachable`, `Transfer engine detected (rclone)`는 `File transfer helper is available`로 바꿨다.
- 버전 확인도 `File transfer helper supports transfers`로 바꿔 내부 도구 이름보다 사용자 결과를 앞세웠다.

## Cycle 4 - Next Action Gating

### Finding

프로필이 없거나 선택되지 않은 상태에서 disabled `Buckets`/`Objects` 링크를 보여주는 것은 기능을 알려주는 효과는 있지만, 첫 단계 집중도를 떨어뜨리고 막힌 UI처럼 보일 수 있다.

### Action

- 활성 프로필이 없을 때는 `Open buckets`와 `Open objects` 링크를 숨기고, 짧은 다음 단계 문구만 보여준다.
- 프로필이 전혀 없으면 `Create a profile to open buckets and objects.`를 보여준다.
- 프로필은 있지만 선택되지 않았으면 `Choose a profile to open buckets and objects.`를 보여준다.
- 이 상태를 직접 검증하는 Playwright 모바일 테스트를 추가했다.

## Cycle 5 - CTA Priority And Dismiss Language

### Finding

프로필이 이미 선택된 사용자의 다음 행동은 대체로 새 프로필 추가가 아니라 객체 화면으로 이동하는 것이다. 또한 `Dismiss`는 무엇을 닫는지 모호하다.

### Action

- 활성 프로필이 있을 때는 `Open objects`를 primary CTA로 올리고, `Open buckets`, `Create another profile`을 뒤에 배치했다.
- `Dismiss`는 `Hide guide`로 바꿔 온보딩 카드만 숨긴다는 의미를 분명히 했다.
- Profiles 모바일 흐름, 접근성 스캔, Profiles visual regression을 다시 확인했다.

## Resulting UX Changes

- 신규 사용자는 첫 화면에서 조작 불가능한 checkbox 대신 명확한 setup progress를 본다.
- 운영자 중심의 `System readiness`와 `rclone` 노출이 `Connection checks`와 파일 전송 도우미 문구로 낮아졌다.
- 프로필이 없을 때는 막힌 다음 화면 링크 대신 지금 해야 할 한 가지 행동이 보인다.
- 프로필이 선택되면 `Open objects`가 가장 먼저 보여, 생성 이후 실제 작업으로 이동하기 쉬워졌다.
- `Hide guide`는 온보딩 카드를 숨기는 행동을 더 명확히 설명한다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/profiles/__tests__/ProfilesOnboardingCard.test.tsx src/pages/__tests__/ProfilesPage.smoke.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:e2e -- tests/profiles-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Profiles page|mobile Profiles"`
- `npm --prefix frontend run test:e2e -- tests/workflows-visual-regression.spec.ts --project=chromium --grep "mobile Profiles"`
- `npm --prefix frontend run build`

## Remaining Watch Items

- 온보딩 카드는 아직 사용자가 수동으로 `Hide guide`를 눌러야 사라진다. 실제 사용 데이터에서 반복 노출이 불편하다면 “프로필 생성 및 선택 완료 후 자동 축소”를 검토할 수 있다.
- `File transfer helper`는 rclone보다 사용자 친화적이지만, 전송 기능을 거의 쓰지 않는 사용자는 여전히 이 항목이 낯설 수 있다. 전송이 필요한 작업을 시작할 때만 별도로 설명하는 방식도 다음 후보이다.
