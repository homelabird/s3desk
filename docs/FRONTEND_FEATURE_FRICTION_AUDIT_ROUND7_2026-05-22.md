# Frontend Feature Friction Audit Round 7 - 2026-05-22

## Scope

현재 프론트엔드를 Playwright 모바일/오버레이 테스트와 visual regression으로 직접 확인한 뒤, 사용자가 해야 할 작업보다 개발자 중심 기능이나 모호한 보조 기능이 더 앞에 보이는 부분을 5개 반복 사이클로 정리하고 개선했다.

## Reference Practices

- [GOV.UK Design Principles](https://www.gov.uk/guidance/government-design-principles): 사용자가 실제로 하려는 일에 맞춰 서비스를 설계하고 불필요한 복잡성을 덜어내는 원칙을 기준으로 삼았다.
- [Nielsen Norman Group usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): 시스템 용어보다 사용자가 이해하는 현실의 언어, 불필요한 선택지 축소, 명확한 제어 라벨을 기준으로 삼았다.
- [Microsoft menu and context menu guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus-and-context-menus): 메뉴 버튼은 담고 있는 동작 범위를 예측할 수 있게 이름을 붙이는 관점을 적용했다.
- [WCAG 2.2 target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 모바일 화면에서 주요 저장/취소 버튼을 가리는 플로팅 요소를 사용자 조작 방해 요소로 판단했다.

## Cycle 1 - Direct Playwright Baseline

### Finding

- 모바일 버킷 정책/거버넌스 흐름은 동작했지만, 정책 편집 진입점과 설명에 `Advanced`가 반복되어 일반적인 정책 편집도 위험한 고급 기능처럼 보였다.
- 오브젝트 선택 바의 `More selection actions`와 `More`는 사용자가 어떤 작업 묶음을 열게 되는지 충분히 말해주지 않았다.
- visual 캡처에서 TanStack Query Devtools 플로팅 버튼이 모바일 다이얼로그 하단 CTA 근처에 떠 있어 실제 사용자의 저장 행동을 방해할 수 있었다.

### Action

- Playwright baseline으로 모바일 버킷 흐름, 정책 오버레이 접근성, 오브젝트 선택 흐름을 확인했다.
- 이후 개선 대상은 기능 제거보다 “사용자에게 보이지 않아야 할 개발 도구 숨김”과 “작업 중심 라벨 재정의”로 좁혔다.

## Cycle 2 - Bucket Policy Editor Labels

### Finding

`Advanced S3 bucket policy workspace`, `Advanced: Policy JSON`, `Advanced GCS IAM policy workspace` 같은 문구는 정책 편집 자체를 예외적 기능처럼 보이게 했다.

### Action

- 정책 워크스페이스 라벨을 `S3 policy editor workspace`, `GCS IAM policy editor workspace`, `Azure container access editor workspace`로 바꿨다.
- `Advanced: ...` 제목은 `Policy editor: ...` 형식으로 바꿔 사용자가 현재 열고 있는 작업을 바로 이해하게 했다.
- 관련 단위 테스트와 접근성 e2e 기대값을 함께 갱신했다.

## Cycle 3 - Governance Raw Policy Copy

### Finding

거버넌스 화면에서도 `advanced policy`, `Advanced: Raw policy`, `Advanced: Provider effects`가 반복되어 사용자가 일상적인 제어와 원문 정책 편집의 차이를 불필요하게 어렵게 느낄 수 있었다.

### Action

- 거버넌스 의사결정 가이드의 원문 정책 진입 문구를 `Open Policy editor only...` 형태로 정리했다.
- OCI는 원문 편집기가 아니라 provider-native 제약을 확인하는 성격이므로 `Provider effects to review`로 바꿨다.
- 거버넌스 요약 태그도 `Raw policy editor`, `Raw policy`로 바꿨다.

## Cycle 4 - Profile And Selection Surface Copy

### Finding

- 프로필 편집 모달의 `advanced sections`는 사용자가 실제로 열어야 하는 섹션이 무엇인지 말하지 않았다.
- 오브젝트 선택 바의 `More` 버튼은 선택한 오브젝트에 적용할 도구 묶음임을 숨겼다.

### Action

- 프로필 설명을 `compatibility or security sections`로 바꿔 선택 이유를 구체화했다.
- 오브젝트 선택 바 버튼 라벨과 접근성 이름을 `Tools` / `Selection tools`로 바꿨다.
- 선택 바 테스트를 새 라벨 기준으로 갱신했다.

## Cycle 5 - Developer Tool Friction Removal

### Finding

TanStack Query Devtools는 개발자에게는 유용하지만 일반 사용자 작업에는 필요 없다. 특히 모바일 다이얼로그에서 하단 CTA 근처에 고정 플로팅 버튼이 보여 저장/취소 행동을 시각적으로 방해했다.

### Action

- React Query Devtools는 이제 `VITE_ENABLE_QUERY_DEVTOOLS=true`일 때만 개발 환경에서 표시된다.
- 기본 개발/e2e 화면에서는 숨겨지므로 사용자 화면과 visual regression 기준에서 플로팅 개발 도구가 사라졌다.
- `frontend/README.md`에 opt-in 환경 변수를 문서화했다.
- 기본 비활성 상태를 보장하는 `FullApp.devtools.test.tsx` 단위 테스트를 추가했다.

## Resulting UX Changes

- 정책/거버넌스에서 “고급 기능”처럼 보이던 원문 편집 진입점을 “정책 편집기”로 재정의했다.
- 필요한 기능은 제거하지 않고, routine controls와 raw/editor 작업의 경계를 더 명확히 했다.
- 오브젝트 선택 메뉴는 더 이상 막연한 `More`가 아니라 선택 도구 모음으로 보인다.
- 모바일 다이얼로그 하단 CTA 위에 뜨던 개발용 플로팅 버튼을 기본 화면에서 제거했다.

## Verification

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit -- src/__tests__/FullApp.devtools.test.tsx src/pages/buckets/__tests__/bucketPolicyDecisionGuide.test.ts src/pages/buckets/__tests__/BucketPolicyModal.test.tsx src/pages/buckets/__tests__/BucketGovernanceModal.test.tsx src/pages/buckets/__tests__/BucketPolicyContentTabs.test.tsx src/pages/objects/__tests__/ObjectsSelectionBar.test.tsx src/pages/__tests__/BucketsPage.smoke.test.tsx`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium --update-snapshots`
- `npm --prefix frontend run test:e2e:visual -- --project=chromium`
- `npm --prefix frontend run test:e2e:smoke`
- `npm --prefix frontend run test:e2e -- tests/buckets-mobile-responsive.spec.ts --project=mobile-pixel-7`
- `npm --prefix frontend run test:e2e -- tests/accessibility-overlays.spec.ts --project=chromium --grep "Bucket policy dialog|mobile Bucket policy sheet"`
- `npm --prefix frontend run test:e2e -- tests/objects-mobile-responsive.spec.ts --project=mobile-pixel-7 --grep "selection actions"`

## Remaining Watch Items

- 오브젝트 상단의 `Switch to advanced mode`는 현재 기능 상태 전환으로 남아 있다. 이후 라운드에서 실제 사용 작업 기준으로 `Detailed mode` 또는 `Power tools` 같은 명칭이 더 적합한지 별도 검토할 수 있다.
- 정책 편집기 내부의 원문 JSON 기능은 S3/GCS/Azure 고급 사용 사례에 필요하므로 제거하지 않았다. 대신 사용자가 routine controls와 raw editor의 목적 차이를 이해하도록 라벨을 좁혔다.
