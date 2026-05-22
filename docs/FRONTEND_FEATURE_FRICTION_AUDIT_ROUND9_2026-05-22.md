# Frontend Feature Friction Audit Round 9 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright 모바일 Settings 흐름, 접근성 스캔, visual regression으로 직접 확인하고, 사용자가 거의 매일 쓰는 설정과 드물게 필요한 운영/복구 도구가 같은 무게로 보이는지 검토했다. 이번 라운드는 Settings의 `System` 영역, 브라우저 복구 액션, 네트워크 재시도 조정, 서버 백업/복구 문구를 5개 반복 사이클로 개선했다.

## Reference Practices

- [Microsoft app settings guidance](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings): 설정은 단순하게 유지하고, 관련 항목을 묶으며, 드문 정보/지원성 항목은 일반 작업과 분리하는 기준을 적용했다.
- [Microsoft progressive disclosure controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 고급 또는 드문 조작은 기본 화면에 모두 펼치지 않고 사용자가 필요할 때 명시적으로 열도록 하는 기준을 적용했다.
- [GOV.UK warning text](https://design-system.service.gov.uk/components/warning-text/): 중요한 결과가 있는 행동은 일반 설명과 구분해 사용자가 위험을 인지할 수 있게 해야 한다는 기준을 적용했다.
- [Atlassian warning messages](https://design-system-docs-proxy.services.atlassian.com/foundations/content/designing-messages/warning-messages/): 위험한 행동은 실행 전 무엇이 바뀌는지, 되돌릴 수 있는지, 계속할지 취소할지 명확하게 알려야 한다는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `settings-mobile-responsive` Playwright 기준 흐름은 통과했지만, Settings 마지막 탭이 `System`으로 표시되어 일반 사용자가 운영자/개발자용 화면에 들어온 느낌을 받을 수 있었다.
- 같은 탭 안에 서버 백업/복구, 네트워크 재시도, 브라우저 로컬 상태 초기화가 같이 노출되어 “설정”보다 “복구 콘솔”처럼 보이는 마찰이 있었다.
- `Reset saved UI state`, `Dismissed dialog confirmations`, `HTTP retry count`, `Retry base delay`는 정확하지만 사용자 작업보다 구현 용어가 앞섰다.

### Action

- 기능 제거보다 정보 구조와 문구 개선을 우선했다.
- 변경 범위를 Settings의 support성 영역과 관련 테스트/스냅샷으로 좁혔다.

## Cycle 2 - System Tab Reframing

### Finding

`System` 탭은 사용자가 OS나 백엔드 시스템 설정을 바꾸는 곳처럼 오해할 수 있다. 실제 내용은 일반 설정이라기보다 문제 해결, 백업/복구, 운영 지원 도구에 가깝다.

### Action

- 탭 라벨을 `Support`로 변경했다.
- 서버 백업/복구 설명을 “이 S3Desk 인스턴스를 이동, 복원, 정리할 때만 쓰는 도구”로 좁혔다.
- 일상적인 탐색, 업로드, 전송은 메인 워크스페이스에서 처리하라는 보조 문구를 유지해 사용자가 설정 화면에 머무르지 않게 했다.

## Cycle 3 - Browser Recovery Progressive Disclosure

### Finding

브라우저 로컬 상태 초기화와 숨긴 확인창 복원은 유용하지만 자주 쓰는 기능이 아니다. 기존처럼 바로 보이면 사용자가 눌러도 되는 일반 설정처럼 오해할 수 있다.

### Action

- 복구 도구를 `Browser recovery tools` 토글 버튼 뒤로 접었다.
- `Saved UI state`는 `Clear saved layout and filters`로, `Reset saved UI state`는 `Clear saved layout`으로 바꿨다.
- 설명에는 API token과 profiles는 유지된다는 점을 명시했다.
- 위험 확인 입력도 `RESET`에서 실제 버튼 의미와 맞는 `CLEAR`로 조정했다.

## Cycle 4 - Hidden Confirmations And Retry Settings Copy

### Finding

`Dismissed dialog confirmations`는 사용자가 “내가 숨긴 확인창을 다시 보이게 하는 것”이라고 바로 해석하기 어렵다. 네트워크 재시도 섹션도 `HTTP`, `policy`, `base delay`처럼 구현 세부사항이 앞에 있었다.

### Action

- 숨긴 확인창 섹션을 `Restore hidden confirmations` / `Restore confirmations`로 변경했다.
- 상태 문구를 `confirmation preference(s) are currently hidden`으로 바꿨다.
- 네트워크 재시도 라벨을 `Request retry attempts`, `Delay before retry (ms)`, `Apply retry settings`, `Discard changes`로 정리했다.
- 네트워크 로그는 `Network troubleshooting log`로 바꿔 일반 설정이 아니라 문제 해결 기록임을 드러냈다.

## Cycle 5 - Verification And Visual Stability

### Finding

초기 구현에서 Ant Design `Collapse` 헤더가 테스트 접근성 트리에서 안정적인 이름의 버튼으로 잡히지 않았다. 사용자가 키보드나 보조 기술로 찾는 표면도 같은 이유로 더 명확한 버튼이 낫다고 판단했다.

### Action

- `Browser recovery tools`를 명시적인 버튼 토글로 구현했다.
- Settings 단위 테스트, 모바일 Playwright 경로, 접근성 스캔, Settings visual snapshot을 새 구조와 라벨에 맞춰 갱신했다.

## Resulting UX Changes

- Settings 마지막 탭은 더 이상 `System`이 아니라 `Support`로 표시되어 운영/복구성 도구의 성격이 명확해졌다.
- 브라우저 복구 도구는 기본 화면에서 펼쳐지지 않고, 사용자가 필요할 때 명시적으로 연다.
- 로컬 상태 초기화는 `Clear saved layout and filters`처럼 사용자가 실제로 잃는/유지되는 범위를 더 잘 설명한다.
- 숨긴 확인창 복원과 네트워크 재시도 설정은 구현 용어보다 사용자 결과 중심으로 읽힌다.
- 모바일 Settings 스냅샷은 `Support` 탭 변경을 반영해 갱신됐다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/__tests__/SettingsPage.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:e2e -- tests/settings-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "mobile Settings drawer"`
- `npm --prefix frontend run test:e2e -- tests/server-migration-live.spec.ts --project=chromium` (suite prerequisite absent, skipped)
- `npm --prefix frontend run test:e2e -- tests/workflows-visual-regression.spec.ts --project=chromium --grep "mobile Settings drawer remains stable" --update-snapshots=all`
- `npm --prefix frontend run test:e2e -- tests/workflows-visual-regression.spec.ts --project=chromium --grep "mobile Settings drawer remains stable"`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`
- `npm --prefix frontend run build`

## Remaining Watch Items

- `Support` 탭 안에는 여전히 서버 백업/복구와 네트워크 조정 기능이 함께 있다. 이번 라운드에서는 문구와 노출 수준을 정리했으며, 향후 사용량이 낮다면 별도의 `Troubleshooting` drawer나 command palette로 더 늦게 노출하는 방식을 검토할 수 있다.
- `Request retry attempts`와 `Delay before retry (ms)`는 아직 숫자 조정 입력이다. 실제 사용자에게 이 설정이 자주 필요하지 않다면 preset 기반 선택으로 바꾸는 것이 다음 개선 후보이다.
