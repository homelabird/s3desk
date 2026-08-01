# S3Desk 컴포넌트별 디자인 평가

Date: 2026-08-01

후속 실행 계획과 영향도: `COMPONENT_DESIGN_IMPROVEMENT_AND_IMPACT_REPORT_2026-08-01.ko.md`

## 결론

현재 S3Desk는 기능성과 접근성은 비교적 안정적이지만, 시각적으로는 **기업용 관리 도구의 기본 템플릿에 장식적인 카드와 설명문을 과하게 얹은 상태**다.

- 종합 미적 완성도: **4.8 / 10**
- 사용성: **6.7 / 10**
- 일관성: **7.1 / 10**
- 접근성 기본기: **7.5 / 10**

가장 큰 문제는 색상이 아니다. 거의 모든 영역에 테두리, 둥근 모서리, 그라데이션, 그림자, 설명문을 함께 사용해 화면의 우선순위가 평평하다. 사용자는 작업 대상보다 컨테이너를 먼저 보게 된다.

## 평가 기준과 근거

점수는 10점 만점이며 다음 항목을 함께 본다.

- 위계: 첫 시선이 핵심 작업으로 향하는가
- 밀도: 운영 도구에 맞는 정보량을 제공하는가
- 일관성: 같은 역할이 같은 모양과 배치로 표현되는가
- 반응형: 모바일에서 전역 chrome보다 작업이 먼저 보이는가
- 상태 표현: 선택, 비활성, 경고, 위험 동작이 분명한가

근거는 현재 소스, 체크인된 Playwright 스냅샷, 2026-08-01에 현재 워크트리로 다시 실행한 디자인 검증이다.

- `npm run check:design`: 통과. CSS 토큰 50개 파일과 82개 토큰을 확인했고 대비 기준도 통과했다.
- `npm run test:e2e:design-audit`: 6개 중 2개 통과, 4개 실패.
- 실패 화면: Objects light, Objects dark, Objects bucket picker, Uploads mobile.
- 원인: 현재 구현과 체크인된 기준 이미지가 3~12%의 픽셀 차이를 보인다. 특히 Uploads는 `Selection` 우선 구조로 바뀌었으나 기준 이미지가 이전 `Target & source` 우선 구조다.

따라서 기존 스냅샷을 현재 디자인의 승인 근거로 그대로 사용할 수 없다.

## 컴포넌트별 평가

| 컴포넌트군 | 점수 | 평가 | 핵심 문제 | 권장 조치 |
| --- | ---: | --- | --- | --- |
| `BrandLockup` | 3.5 | 나쁨 | 애니메이션 캐릭터풍 마스코트와 `LOCAL DASHBOARD`의 과한 자간이 저장소 운영 도구의 성격과 충돌한다. 사이드바, 모바일 헤더, 로그인에서 반복되어 제품 전체를 취미 프로젝트처럼 보이게 한다. | 새 시스템을 만들지 말고 현재 마스코트를 단색 S3Desk 심볼 또는 워드마크로 교체한다. 로그인 외에는 subtitle을 제거한다. |
| `FullAppShellChrome` / 전역 헤더 | 5.0 | 보통 이하 | 데스크톱 상단에 테마, Profile 라벨, 긴 셀렉트, Transfers, Settings, Logout이 한 줄에 모두 노출된다. 좌측 내비게이션과 역할이 겹치고 본문보다 chrome이 강하다. | 테마와 Logout을 하나의 사용자 메뉴로 합치고, 상단에는 활성 profile과 Transfers만 남긴다. |
| 사이드바 내비게이션 | 6.5 | 양호 | 활성 상태와 아이콘은 명확하다. 다만 220px 폭에 메뉴가 4개뿐이고 큰 브랜드 블록 때문에 공간 효율이 낮다. | 폭을 184~192px로 줄이고 브랜드 높이를 낮춘다. 새 축소 기능은 필요 없다. |
| `PageHeader` | 4.0 | 나쁨 | 모든 페이지 제목을 큰 카드, 강한 테두리, 그라데이션, 그림자로 감싼다. 제목·eyebrow·설명·액션이 모두 강조되어 화면마다 불필요한 히어로 영역이 생긴다. | 카드 배경과 그림자를 제거하고 제목, 짧은 설명, 우측 주 행동만 남긴 평면 헤더로 바꾼다. |
| `PageSection` | 4.5 | 보통 이하 | 섹션마다 gradient header, border, shadow, 별도 body를 사용한다. 카드 안의 카드가 반복되고 모바일 첫 화면을 설명과 여백이 차지한다. | 기본값을 평면 section으로 만들고, 실제로 독립된 선택·요약 표면에만 border를 쓴다. |
| 버튼·입력·셀렉트 | 6.5 | 양호 | Ant Design 기본기가 있어 상태와 포커스는 분명하다. 그러나 text/link/default/primary 버튼이 한 화면에 많이 섞이고, 작은 아이콘 버튼과 큰 pill 버튼의 스타일 톤이 다르다. | primary는 화면당 하나를 원칙으로 하고, 보조 행동은 메뉴로 접는다. 컨트롤 자체를 새로 만들 필요는 없다. |
| `AppTabs` | 6.0 | 보통 이상 | 키보드 동작과 overflow 대응은 좋다. Settings와 Transfers에서 탭, 닫기, 상단 액션이 비슷한 시각 무게를 가져 콘텐츠 시작점이 약하다. | 탭 아래 여백을 줄이고 drawer 상단 액션을 축약한다. 현재 컴포넌트를 유지한다. |
| `DialogModal` / `OverlaySheet` | 6.0 | 보통 이상 | focus와 모바일 sheet 전환은 안정적이다. 반면 큰 원형 닫기 버튼, gradient header, sticky footer가 모든 다이얼로그에 반복되어 무겁다. | header 배경을 평면화하고 닫기 버튼 테두리를 제거한다. footer는 실제 액션이 있을 때만 유지한다. |
| Profiles 목록·온보딩 | 4.5 | 보통 이하 | 빈 상태에서 page header, getting-started 카드, Empty가 같은 행동을 반복한다. 테이블은 badge와 chip이 많아 연결 정보보다 상태 장식이 먼저 보인다. | 빈 상태 CTA를 하나로 합치고 onboarding은 접을 수 있는 짧은 체크리스트로 줄인다. |
| Profile 편집 | 3.5 | 나쁨 | 모바일에서 소개 카드, setup checklist, ready badge, 섹션 카드가 연속된다. 사용자는 실제 필드를 보기 전에 상태 설명을 오래 읽어야 한다. | 기본 연결 필드를 맨 위에 노출하고 checklist는 오류가 있을 때만 요약한다. Advanced/Security는 기존 접기 구조를 유지한다. |
| Buckets 목록·생성 | 5.5 | 보통 | 목록 자체는 읽기 쉽다. 하지만 PageHeader가 과하고, Create Bucket은 필드 두 개보다 큰 정보 Alert가 더 강해 단순 작업을 복잡하게 보이게 한다. | 생성 모달의 provider 안내를 한 줄 보조문으로 줄이고 제목 아래 설명을 제거한다. |
| Bucket policy / governance | 4.0 | 나쁨 | `Recommended`, policy editor, badge, warning, danger zone이 긴 카드 스택으로 쌓인다. 색과 테두리가 많지만 작업 순서는 오히려 늦게 이해된다. | `Controls`와 `JSON policy`를 두 탭으로 유지하고, 선택하지 않은 경로의 설명 카드는 숨긴다. 위험 동작만 footer에서 분리한다. |
| Objects page header / toolbar | 4.5 | 보통 이하 | 현재 구현은 bucket을 먼저 두는 방향으로 나아졌지만, 제목 아래 bucket, 탐색 버튼, 경로, 즐겨찾기, 검색, 필터, 보기 방식, 정렬, 요약이 여러 행에 흩어진다. `Tools`도 별도 행에 떠 있다. | 1행은 bucket/path + Upload/New folder, 2행은 검색 + View/Sort로 고정한다. 즐겨찾기와 기타 도구는 `Tools`로 합친다. |
| Objects list / grid | 6.5 | 양호 | 데이터 표는 가장 안정적인 영역이다. 긴 key가 말줄임되고 크기·수정일·행 액션이 정렬된다. 다크 테마 대비도 충분하다. 다만 행 높이가 크고 아이콘/체크/별표/미리보기가 이름보다 앞선다. | 행 높이를 약간 줄이고, Preview는 hover 또는 row menu로 옮긴다. 표 구조는 유지한다. |
| Bucket picker / global search | 5.0 | 보통 | picker는 떠 있는 표면임이 분명하지만, 현재 bucket 하나에도 검색·Clear·CURRENT 설명·카드·badge가 모두 보인다. 검색 결과는 긴 key보다 액션 폭이 강해질 위험이 있다. | bucket이 적으면 native select 수준으로 단순화하고, 검색 결과는 key에 폭을 우선 배정하며 보조 액션을 메뉴로 합친다. |
| Uploads | 6.0 | 보통 이상 | 현재 구현은 `Selection`을 `Target & source`보다 먼저 보여 기존 문제를 개선했다. CTA도 분명하다. 그러나 PageHeader와 빈 preview 카드가 첫 viewport를 크게 차지하고 목적지 입력은 아래로 밀린다. | PageHeader를 평면화하고 빈 preview 박스를 제거한다. 선택 전에는 CTA와 destination 입력을 한 화면에 보이게 한다. |
| Jobs / Activity | 6.0 | 보통 이상 | 상태 중심 데이터 구조와 필터 sheet는 실용적이다. 모바일 filter sheet는 명료하지만 여백이 지나치게 커 빈 화면처럼 보인다. 데스크톱 toolbar는 기능이 많아 계층이 약하다. | 모바일 sheet 높이를 내용에 맞추고, 자주 쓰지 않는 필터와 생성 액션을 `More`로 정리한다. |
| Transfers | 5.5 | 보통 | Downloads/Uploads 탭과 empty state는 이해하기 쉽다. 상단의 `Clear done`, `Clear all`, 큰 닫기 버튼은 빈 상태에서도 먼저 보여 불필요한 명령 밀도를 만든다. | 항목이 없으면 clear 액션을 숨긴다. 닫기는 표준 아이콘 버튼으로 낮춘다. |
| Login / `TokenLoginPanel` | 5.0 | 보통 | 입력과 오류 설명은 명확하다. 그러나 마스코트와 대형 워드마크가 단일 API token 작업보다 강하고, 안내 박스·입력·Clear 버튼·긴 설명이 작은 화면에 과하다. | 작은 워드마크 + 제목 + token 입력 + Login만 기본 노출하고, 보안 설명과 저장 token 삭제는 보조 링크로 내린다. |
| 배너·Empty·Loading 상태 | 5.5 | 보통 | 의미와 접근성은 좋지만 같은 화면에 Alert, Empty, onboarding card가 중첩되어 상태 하나를 여러 번 말한다. | 상태당 대표 컴포넌트 하나만 사용하고 중복 CTA를 제거한다. |

## 반복되는 디자인 원인

### 1. 강조 수단이 너무 많다

현재 공통 패턴은 `gradient + border + radius + shadow + eyebrow + description`이다. 각각은 나쁘지 않지만 거의 모든 영역에 동시에 쓰여 강조가 사라졌다.

### 2. 설명이 행동보다 먼저 나온다

Profile 편집, Bucket policy, Uploads, Login은 사용자가 이미 알고 있거나 필요할 때만 보면 되는 설명을 기본 화면에 모두 펼친다.

### 3. 브랜드 톤이 제품 성격과 맞지 않는다

캐릭터 마스코트는 친근하지만, 나머지 화면은 엄격한 엔터프라이즈 관리 UI다. 두 톤이 충돌해 완성도가 낮아 보인다.

### 4. 컴포넌트는 일관되지만 결과 화면은 과밀하다

공통 토큰과 primitive는 잘 정리되어 있다. 문제는 새 컴포넌트 부족이 아니라 `PageHeader`, `PageSection`, `Alert`, badge를 한 화면에 너무 많이 조합하는 방식이다.

## 개선 우선순위

### P0 — 제품 인상을 가장 크게 바꾸는 작업

1. `PageHeader`를 평면형으로 축소한다.
2. `PageSection`의 기본 gradient와 shadow를 제거한다.
3. `BrandLockup`의 마스코트와 대문자 subtitle을 정리한다.
4. Objects toolbar를 두 행으로 고정하고 기타 도구를 합친다.
5. 현재 의도에 맞춰 시각 스냅샷을 검토·갱신하고 6개 디자인 감사 테스트를 다시 통과시킨다.

### P1 — 작업 흐름 개선

1. Profile 편집의 checklist를 조건부 요약으로 바꾼다.
2. Bucket policy의 설명 카드 스택을 탭 기반 작업 화면으로 줄인다.
3. Login의 브랜딩과 설명을 축소한다.
4. Transfers와 Jobs에서 상태상 불가능한 상단 액션을 숨긴다.

### P2 — 밀도 다듬기

1. Objects 행 높이와 아이콘 수를 줄인다.
2. 모바일 sheet를 내용 높이에 맞춘다.
3. sidebar 폭과 상단 header 간격을 줄인다.

## 최소 구현 원칙

새 디자인 시스템이나 새 UI 라이브러리는 필요 없다. 현재 토큰과 Ant Design을 유지하면서 다음 세 파일군부터 고치면 전체 화면에 효과가 퍼진다.

- `src/components/PageHeader.module.css`
- `src/components/PageSection.module.css`
- `src/components/BrandLockup.tsx`와 `BrandLockup.module.css`

페이지별 수정은 공통 표면을 평면화한 뒤에도 남는 Objects toolbar, Profile 편집, Bucket policy에만 적용하는 것이 가장 작고 효과적인 경로다.
