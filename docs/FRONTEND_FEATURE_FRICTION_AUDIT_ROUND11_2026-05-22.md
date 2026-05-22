# Frontend Feature Friction Audit Round 11 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright Jobs 모바일 흐름, Jobs 접근성 스캔, visual regression으로 직접 확인하고, Activity 화면이 작업 이력 확인보다 새 작업 생성 표면처럼 보이는지 검토했다. 이번 라운드는 Activity 상단의 `New job` 메뉴, 빈 상태의 다운로드/삭제 job CTA, 메뉴 라벨, 관련 테스트 헬퍼를 5개 반복 사이클로 개선했다.

## Reference Practices

- [Atlassian empty state guidance](https://atlassian.design/foundations/content/designing-messages/empty-state): 빈 상태는 짧고 스캔 가능해야 하며, 사람을 과도한 CTA로 압도하지 않아야 한다는 기준을 적용했다.
- [Microsoft command button text guidance](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/bb226792%28v%3Dvs.85%29): 버튼은 동사 중심으로 쓰고, 보조 화면을 여는 버튼은 해당 화면의 용어와 맞춰야 한다는 기준을 적용했다.
- [Microsoft menu text guidance](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/bb246448%28v%3Dvs.85%29): 메뉴 명령은 현재 맥락에서 가능한 행동을 구체적으로 설명해야 하며, 추가 입력이 필요한 명령에는 ellipsis를 쓰는 기준을 적용했다.
- [Microsoft progressive disclosure controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls): 기본 화면은 핵심 작업에 집중하고, 보조/드문 명령은 필요할 때 드러내는 기준을 적용했다.

## Cycle 1 - Playwright Baseline And Friction Scan

### Finding

- `jobs-mobile-responsive` 기준 흐름은 통과했지만, 320px 모바일 상단에서 `Upload`와 `New job`이 함께 보였다.
- Activity 빈 상태는 `Upload…`, `Download…`, `New delete job` 세 가지 시작점을 모두 보여줘, Activity가 이력 확인 화면인지 작업 생성 화면인지 역할이 흐려졌다.
- 특히 `New delete job`은 고위험 작업을 빈 상태의 기본 선택지처럼 보이게 했다.

### Action

- 개선 범위를 Jobs toolbar, Jobs empty state, 관련 unit/e2e 헬퍼로 좁혔다.
- Activity에서 직접 가능한 기능을 완전히 제거하지 않고, 빈 상태와 상단 기본 표면에서 우선순위를 낮추는 방식으로 결정했다.

## Cycle 2 - Empty State CTA Reduction

### Finding

빈 상태는 사용자가 가장 빨리 다음 행동을 판단하는 곳이다. 다운로드/삭제/업로드 CTA와 help tooltip이 동시에 보이면 첫 화면부터 선택지가 과하다.

### Action

- 빈 상태 제목을 `No jobs yet.`에서 `No activity yet.`으로 바꿨다.
- 빈 상태 설명은 Activity가 업로드, 다운로드, 삭제, 기타 백그라운드 작업 이후 채워진다는 역할 설명으로 좁혔다.
- 빈 상태 CTA는 `Upload from device`와 `Open objects`만 남겼다.
- `Download…`, `New delete job`, 각 help tooltip은 빈 상태에서 제거했다.

## Cycle 3 - Object-Specific Work Routing

### Finding

다운로드와 삭제는 사용자가 버킷/프리픽스/객체 맥락을 확인한 뒤 실행해야 안전하다. Activity 빈 상태에서 바로 시작하면 사용자가 버킷 이름과 prefix를 수동으로 추론해야 한다.

### Action

- 빈 상태에 `Open objects` 링크를 추가해 객체별 작업은 Objects 화면에서 시작하도록 유도했다.
- `JobsTableSection`은 더 이상 빈 상태용 download/delete open handler를 받지 않도록 props를 정리했다.
- presentation builder 테스트도 Activity 빈 상태가 upload와 object navigation 중심임을 반영하도록 갱신했다.

## Cycle 4 - More Job Actions Labeling

### Finding

상단 `New job` 버튼은 너무 넓은 이름이다. 사용자는 어떤 종류의 job을 만들게 되는지 알기 어렵고, Upload primary CTA와 의미가 겹친다.

### Action

- `New job` 버튼을 `More job actions`로 바꿨다.
- 메뉴 항목은 `Download...`에서 `Download to device...`, `New Delete Job`에서 `Delete bucket or prefix...`로 구체화했다.
- delete job은 여전히 필요한 운영 흐름을 위해 남겼지만, 빈 상태 primary CTA가 아니라 보조 메뉴 안에만 둔다.

## Cycle 5 - Regression And Helper Alignment

### Finding

메뉴 라벨 변경으로 기존 Playwright helper가 `More` / `New Delete Job`을 찾는 경로가 맞지 않았다. 사용자의 실제 접근 경로가 바뀌었기 때문에 테스트 헬퍼도 새 라벨을 따라야 한다.

### Action

- `openCreateDeleteJobDrawer` 기본 버튼명을 `More job actions`로 바꿨다.
- delete 메뉴 선택자는 `Delete bucket or prefix...`로 갱신했다.
- Jobs 모바일, Jobs 접근성, Jobs visual, jobs create/cancel/retry 흐름을 새 라벨 기준으로 다시 검증했다.

## Resulting UX Changes

- Activity 빈 상태는 이제 새 job 생성 메뉴가 아니라 이력 화면의 안내처럼 읽힌다.
- 고위험 `New delete job` CTA가 빈 상태에서 사라져 실수로 삭제 흐름을 시작할 가능성이 줄었다.
- 객체/프리픽스 기반 작업은 `Open objects`로 자연스럽게 이동한다.
- 상단 보조 메뉴는 `More job actions`와 구체적인 메뉴명으로 범위를 더 잘 설명한다.
- 기존 delete job 생성 기능은 제거하지 않고, 필요한 사용자만 보조 메뉴에서 찾을 수 있게 유지했다.

## Verification

- `npm --prefix frontend run test:unit -- src/pages/jobs/__tests__/JobsToolbar.test.tsx src/pages/jobs/__tests__/JobsTableSection.test.tsx src/pages/jobs/__tests__/buildJobsPagePresentationProps.test.ts src/pages/jobs/__tests__/useJobsPageController.test.tsx`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:e2e -- tests/jobs-mobile-responsive.spec.ts --project=mobile-iphone-13 --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Jobs page|mobile Jobs"`
- `npm --prefix frontend run test:e2e -- tests/workflows-visual-regression.spec.ts --project=chromium --grep "mobile Jobs filters sheet remains stable"`
- `npm --prefix frontend run test:e2e -- tests/jobs-flow.spec.ts --project=chromium`
- `npm --prefix frontend run build`

## Remaining Watch Items

- Activity 상단에는 여전히 Upload primary CTA가 있다. 사용자가 Objects와 Activity 양쪽에서 upload를 시작하며 혼란을 느낀다면, Activity의 Upload도 `Upload from device` 보조 액션이나 Objects 안내로 더 낮출 수 있다.
- Delete job은 보조 메뉴에 남아 있다. 실제 사용 빈도가 낮으면 Objects/Buckets 맥락에서만 노출하고 Activity에서는 제거하는 후속 단순화가 가능하다.
