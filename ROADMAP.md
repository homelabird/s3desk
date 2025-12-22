# 로컬 Object Storage Dashboard (S3 호환) — 설계 & 로드맵

이 문서는 `s5cmd`를 대량 전송 엔진으로 사용하고, **브라우저 기반(로컬 전용)** 대시보드를 만들기 위한 API/Job 설계와 단계별 로드맵 초안이다.

## 1) 목표 / 범위

### 목표
- 로컬에서 실행되는 단일 대시보드로 S3 호환 스토리지에 대해 아래 기능 제공
  - 버킷 생성
  - 데이터 주입(업로드/대량 동기화)
  - 데이터 탐색(대규모 목록/가상 스크롤/페이지네이션)
- 엔터프라이즈급 스케일을 전제로 **prefix 기반 탐색 + continuation token**을 필수로 설계
- 전송/동기화는 `s5cmd`를 통해 고성능으로 수행하고, UI에서는 Job으로 관측/취소/재시도 가능

### 비목표(초기)
- IAM/정책 편집, 계정/키 관리 UI
- 버킷 정책/ACL/수명주기(ILM) 편집 UI
- 멀티 사용자/원격 호스팅(본 프로젝트는 로컬 전용)

## 2) 권장 기술 스택

- Frontend: `React + TypeScript + Vite`
  - UI: `Ant Design`
  - 대용량 목록: `TanStack Table` + `TanStack Virtual`
  - 데이터/캐시: `TanStack Query`(continuation token 기반 페이지 캐시)
  - Job 관측: `WebSocket`(대안: SSE)
- Backend: `Go`
  - 탐색/메타데이터: `AWS SDK for Go v2` (S3 API)
  - 대량 전송/동기화: `s5cmd` 프로세스 실행/관리(`exec.CommandContext`)
  - 상태 저장: `SQLite`(jobs/profiles) + 로그 파일 append

## 3) 아키텍처 개요

- 브라우저(UI) → `Go API(127.0.0.1)` → (A) S3 SDK(탐색/메타데이터) (B) Job Runner(`s5cmd`)
- UI는 `Go`가 같은 오리진으로 정적 파일을 서빙(권장)하여 CORS/CSRF 공격면을 최소화

권장 디렉터리(예시)
- `backend/`: Go 서버(REST+WS, job runner, sqlite)
- `frontend/`: Vite 앱
- `docs/`: 설계/로드맵

## 4) 데이터 모델(초안)

### profiles
- `id`(uuid/ulid), `name`
- `endpoint`, `region`, `forcePathStyle`
- `accessKeyId`, `secretAccessKey`, `sessionToken`(저장 방식은 보안 정책에 따름)
- `tlsInsecureSkipVerify`(가능하면 기본 false)
- `createdAt`, `updatedAt`

### jobs
- `id`(ulid), `type`
- `status`(queued|running|succeeded|failed|canceled)
- `payloadJson`
- `progressJson`(집계치)
- `error`(요약)
- `createdAt`, `startedAt`, `finishedAt`

### upload_sessions (브라우저 업로드용 스테이징)
- `id`, `profileId`, `bucket`, `prefix`
- `stagingDir`, `expiresAt`

## 5) API v1 (REST)

공통
- Base: `/api/v1`
- 프로필 지정: 기본은 헤더 `X-Profile-Id: <profileId>` 권장(대안으로 query 지원 가능)
- 응답 에러(권장): `{ "error": { "code":"...", "message":"...", "details":{...} } }`

### 5.1 Profiles
- `GET /profiles` 목록
- `POST /profiles` 생성
  - body:
    - `name`, `endpoint`, `region`
    - `accessKeyId`, `secretAccessKey`, `sessionToken?`
    - `forcePathStyle`, `tlsInsecureSkipVerify`
- `PATCH /profiles/{id}` 수정
- `DELETE /profiles/{id}` 삭제
- `POST /profiles/{id}/test` 연결 테스트(권한/서명/엔드포인트 확인)

### 5.2 Buckets
- `GET /buckets` 버킷 목록
- `POST /buckets` 버킷 생성
  - body: `{ "name":"my-bucket", "region":"us-east-1" }`
  - 비고: S3 호환 구현체(예: Ceph RGW) 별로 region/location-constraint 처리 차이가 있어 백엔드에서 호환 분기 필요

### 5.3 Objects (탐색)
- `GET /buckets/{bucket}/objects`
  - query:
    - `prefix`(기본 `""`)
    - `delimiter`(기본 `"/"`; 폴더처럼 탐색)
    - `maxKeys`(기본 200~1000)
    - `continuationToken`(다음 페이지)
  - response:
    - `commonPrefixes: string[]` (하위 “폴더”)
    - `items: { key, size, etag, lastModified, storageClass? }[]`
    - `nextContinuationToken`, `isTruncated`
- `GET /buckets/{bucket}/objects/meta?key=...`
  - HEAD 기반 메타 조회(ETag, size, lastModified 등)
- (옵션) `DELETE /buckets/{bucket}/objects`
  - body: `{ "keys": ["a", "b", ...] }`
  - 대량 삭제는 Job으로도 제공 가능

### 5.4 Uploads (브라우저 업로드 → 스테이징 → s5cmd 전송)
대규모 업로드를 “브라우저에서 바로 S3로” 보내는 것은 네트워크/재시도/성능 측면에서 한계가 있어, 초기엔 서버 스테이징 후 `s5cmd sync`로 전송하는 방식을 권장한다.

- `POST /uploads`
  - body: `{ "bucket":"b", "prefix":"p/" }`
  - response: `{ "uploadId":"...", "maxBytes":..., "expiresAt":"..." }`
- `POST /uploads/{uploadId}/files` (`multipart/form-data`)
  - 여러 파일 수신(서버의 `stagingDir`에 저장)
- `POST /uploads/{uploadId}/commit`
  - response: `{ "jobId":"..." }` (스테이징 → S3 전송 Job 생성)
- `DELETE /uploads/{uploadId}`
  - 스테이징 정리/취소

### 5.5 Jobs
- `GET /jobs`
  - query: `status?`, `type?`, `limit?`, `cursor?` (최신순 페이지)
- `POST /jobs` 생성(대량 전송/동기화/대량 삭제 등)
  - 예1) 로컬 경로 → S3 동기화:
    - `{ "type":"s5cmd_sync_local_to_s3", "payload":{ "bucket":"b","prefix":"p/","localPath":"...","deleteExtraneous":false,"include":[],"exclude":[] } }`
  - 예2) 스테이징 → S3 전송:
    - `{ "type":"s5cmd_sync_staging_to_s3", "payload":{ "uploadId":"..." } }`
- `GET /jobs/{id}` 단건 조회
- `POST /jobs/{id}/cancel` 취소(프로세스 kill + 상태 caceled)
- (옵션) `GET /jobs/{id}/logs?afterSeq=...` 폴링용 로그 조회(WS 미사용 시)

## 6) WebSocket (진행률/로그 스트리밍)

- `GET /api/v1/ws` (WS 업그레이드)

메시지 envelope(권장)
- `{ "type":"job.progress", "ts":"2025-12-12T12:34:56Z", "seq":123, "jobId":"01J...", "payload":{...} }`

이벤트 타입(최소)
- `job.created`: `{ job }`
- `job.progress`: `{ status, progress }`
- `job.log`: `{ level:"info|error", message }`
- `job.completed`: `{ status:"succeeded|failed|canceled", result?, error? }`
- `jobs.deleted`: `{ jobIds: string[], reason: "manual|retention" }`

progress payload(집계치, 예시)
- `{ "objectsDone":10, "objectsTotal":null, "bytesDone":1234, "bytesTotal":null, "speedBps":123456, "etaSeconds":null }`

## 7) s5cmd Job 실행 규칙(필수 가드레일)

- 화이트리스트: 허용된 작업 유형만(Job type → 고정된 s5cmd subcommand/flag 조합)
- 인자 전달: 쉘 문자열 조립 금지, 반드시 args 배열로 실행(인젝션 방지)
- 자격증명 주입: env로 전달하고 로그에는 마스킹(AccessKey/Secret 노출 금지)
- 취소/타임아웃: `exec.CommandContext` + 프로세스 그룹 종료(가능하면 트리 kill)
- 동시성 제한: 워커풀/세마포어로 Job 동시 실행 수 제한(기본 2~4 권장)
- 로그 수집: stdout/stderr line 단위로 append + WS로 스트리밍
- 결과 파싱: 가능하면 `s5cmd`의 구조화 출력 옵션(JSON 등)이 있으면 사용, 없으면 파서 안정성을 위해 “우리만의 고정 포맷”으로 래핑(추후 개선)

## 8) 로컬 전용 보안 지침(권장)

- 바인딩: `127.0.0.1`(또는 `localhost`)에만 리슨, 외부 인터페이스 바인딩 금지
- 오리진 방어:
  - UI를 백엔드가 같은 오리진으로 서빙(권장)
  - `Origin/Host` 검증 + CORS 최소화(기본은 CORS 미허용)
  - 상태 변경 API는 “랜덤 토큰 헤더” 요구(로컬 악성 웹페이지의 CSRF/localhost 공격 완화)
- 파일 경로:
  - 스테이징/로컬 주입 경로는 allowlist 디렉터리 하위만 허용하는 옵션 고려
  - 경로 traversal(`..`) 차단
- TLS:
  - 가능하면 정상 인증서 사용, `tlsInsecureSkipVerify`는 예외로만

## 9) 로드맵(마일스톤)

### M0. 스캐폴딩/로컬 실행
- Go 서버 골격(REST+WS) + 정적 프론트 서빙(같은 오리진)
- SQLite 초기 스키마(profiles/jobs/upload_sessions)
- 설정 로딩/저장(최소)

### M1. 프로필/버킷 기본
- 프로필 CRUD + 연결 테스트
- 버킷 목록 + 버킷 생성
- (필수) 로컬 전용 보안 가드(127.0.0.1 바인딩, Origin/Host 체크, 상태변경 토큰)

### M2. 탐색 MVP(엔터프라이즈 스케일 대응)
- `ListObjectsV2(prefix+delimiter+continuation token)` 기반 탐색 API
- 프론트: prefix 브라우저 + 가상 스크롤 + 페이지 캐시
- 오브젝트 메타 조회(HEAD) + 기본 액션(복사키/다운로드 준비 등은 후순위 가능)

### M3. Job 시스템(관측/취소/로그)
- Job 생성/조회/취소 API
- WS 이벤트 스트림(job.created/progress/log/completed)
- 프론트: Job 패널(실행중/완료/실패), 로그 뷰어

### M4. 데이터 주입(업로드/대량 동기화)
- 브라우저 업로드: 스테이징 세션 → 파일 업로드 → commit(Job 생성) → s5cmd 전송
- 대량 주입: 로컬 경로 sync(Job) + include/exclude 규칙
- 재시도 정책(네트워크 오류/권한/충돌)과 사용자 피드백 정교화

### M5. 하드닝/운영 품질
- 크리덴셜 저장 강화(OS 키체인 또는 암호화 저장)
- 성능 튜닝(동시성/버퍼, 큰 로그 처리, UI 가상화 최적화)
- 패키징 정책 확정(`s5cmd` 번들링/의존성 설치 안내) + 릴리즈 문서화
- (옵션) OpenAPI 3.0 스펙 작성 및 코드 생성/검증 파이프라인

## 10) 다음 산출물(제안)
- OpenAPI 3.0 초안: `docs/object-storage-dashboard/openapi.yaml` (WebSocket 이벤트는 본 문서에 유지)
- 프론트 화면 설계(버킷/탐색/업로드/Jobs) 와이어프레임
- `s5cmd` 실제 플래그/출력 포맷 확정(버전 고정 포함)
