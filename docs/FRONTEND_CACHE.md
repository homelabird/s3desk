# 프론트 캐시/무효화 흐름

이 문서는 화면별 React Query 키와 mutation 이후 무효화/갱신 흐름을 요약합니다.

전역 패턴

- QueryClient: frontend/src/main.tsx에서 단일 인스턴스 사용
- API 호출: frontend/src/api/client.ts에서 헤더 주입, GET에 대해 retry/timeout 처리
- 실시간 갱신: SSE/WS 이벤트로 Jobs 캐시를 갱신하고 목록을 무효화
- 로컬 설정: useLocalStorageState로 탭 간 동기화

화면별 Query Key

ProfilesPage

- ['profiles', apiToken]
- ['meta', apiToken]
- ['profileTls', profileId, apiToken] (프로필 편집 시)

BucketsPage

- ['buckets', profileId, apiToken]

ObjectsPage

- ['buckets', profileId, apiToken]
- ['objects', profileId, bucket, prefix, apiToken] (infinite)
- ['objectFavorites', profileId, bucket, apiToken]
- ['objectsIndexSearch', profileId, bucket, q, filters..., apiToken] (infinite)
- ['objectMeta', profileId, bucket, key, apiToken] (상세 패널)
- ['objectIndexSummary', profileId, bucket, prefix, apiToken] (삭제/복사 미리보기)

UploadsPage

- ['buckets', profileId, apiToken]

JobsPage

- ['jobs', profileId, apiToken, statusFilter, typeFilter] (infinite)
- ['job', profileId, jobId, apiToken] (상세)
- ['buckets', profileId, apiToken]
- ['upload-etags', profileId, bucket, uploadItemsKey]

TopBarProfileSelect

- ['profiles', apiToken]

SettingsDrawer

- ['meta', apiToken] (열려 있을 때만)

Mutation 이후 무효화/갱신

ProfilesPage

- create/update/delete → invalidate ['profiles']
- TLS update/delete → invalidate ['profileTls', profileId]

BucketsPage

- create/delete → invalidate ['buckets']

ObjectsPage

- 객체 삭제(직접) → invalidate ['objects']
- 객체 삭제(Job) → invalidate ['jobs'] 후 invalidate ['objects']
- zip prefix/objects → invalidate ['jobs']
- copy/move (object/prefix/batch) → invalidate ['jobs']
- 폴더 생성 → invalidate ['objects'] + 트리 노드 리로드
- 즐겨찾기 추가/삭제 → setQueryData로 로컬 갱신

JobsPage

- create/cancel/retry/delete → invalidate ['jobs']
- 로그 tail/offset 읽기 → 로컬 상태만 갱신

실시간 업데이트 흐름 (Jobs)

- SSE/WS로 /api/v1/events 또는 /api/v1/ws 연결
- 이벤트 처리:
  - job.created, jobs.deleted → invalidate ['jobs'] (exact:false)
  - job.progress, job.completed → setQueriesData(['jobs'], updateJob)

다이어그램 (jobs 캐시)

WS/SSE event
  -> JobsPage.handleEvent
     -> job.created/jobs.deleted: invalidate queries
     -> job.progress/job.completed: setQueriesData

비고

- WS/SSE가 끊기면 JobsPage는 refetchInterval=5000으로 폴백합니다.
- Transfers(업로드/다운로드)는 React Query가 아닌 로컬 상태로 관리합니다.
- Settings에서 API retry 기본값을 localStorage로 조정할 수 있습니다.
  - apiRetryCount, apiRetryDelayMs
