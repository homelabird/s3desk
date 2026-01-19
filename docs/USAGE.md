# 사용법 (S3Desk)

S3Desk는 **오브젝트 스토리지**를 웹 UI로 조회하고, `rclone` 기반의 대량 작업(업로드/삭제/복사/동기화 Job)을 실행할 수 있는 대시보드입니다.

현재 코드 기준으로 provider 지원 등급은 아래와 같습니다(자세한 범위/제약은 `docs/PROVIDERS.md` 참고).

**Tier 1**
- AWS S3
- S3 호환 스토리지(Ceph RGW, MinIO 등)
- Microsoft Azure Blob Storage
- Google Cloud Storage(GCS)

**Tier 2**
- OCI S3-compatible endpoint
- OCI native Object Storage (rclone `oracleobjectstorage` backend)

## 추가 문서

- `docs/API_SAMPLES.md`: 주요 엔드포인트별 요청/응답 샘플
- `docs/JOB_RCLONE_MAP.md`: Job 타입과 rclone 명령 매핑
- `docs/S3Desk.postman_collection.json`: Postman 컬렉션
- `docs/S3Desk.insomnia_collection.json`: Insomnia 컬렉션

## 컨테이너 이미지 태그

- Docker Compose는 루트 `.env`의 `S3DESK_IMAGE`, `S3DESK_TAG`를 사용합니다.
- 기본(Postgres) 태그: `${S3DESK_TAG}`
- SQLite 태그: `${S3DESK_TAG}-sqlite`
- 릴리스 버전을 바꾸려면 `.env`의 `S3DESK_TAG`만 변경하세요.

## 1) 실행 후 접속

- 기본 접속: `http://127.0.0.1:8080` 또는 `http://localhost:8080`
- WSL2/컨테이너 포트매핑으로 실행하는 경우: `http://<WSL2 IP>:8080` 로도 접속될 수 있습니다.
  - 브라우저 콘솔에 `Cross-Origin-Opener-Policy ... untrustworthy` 경고가 뜨면 `localhost` 로 접속하는 것을 권장합니다(HTTP+IP 조합은 “신뢰할 수 없는 origin”으로 분류될 수 있음).
- API 문서(OpenAPI 3.0 UI): `http://127.0.0.1:8080/docs`
- OpenAPI 스펙: `http://127.0.0.1:8080/openapi.yml`

## 2) API Token (X-Api-Token) 설정

UI의 **Settings → Backend API Token (X-Api-Token)** 은 **S3 AccessKey/SecretKey가 아닙니다.**

- 서버 실행 시 설정한 `API_TOKEN`(또는 `--api-token`) 값과 **동일하게** 입력해야 합니다.
- 기본(local-only)로만 쓸 때는 비워도 동작할 수 있지만, 아래처럼 **원격 바인딩(0.0.0.0) / WSL2 포트 매핑**을 쓸 때는 안전을 위해 토큰을 켜는 것을 권장합니다.

WSL2/rootless Podman 예시:

```bash
podman run --rm -p 8080:8080 \
  -e ADDR=0.0.0.0:8080 \
  -e ALLOW_REMOTE=true \
  -e API_TOKEN=change-me \
  -e ALLOWED_HOSTS=s3desk.local \
  -e JOB_QUEUE_CAPACITY=256 \
  -e JOB_LOG_MAX_LINE_BYTES=262144 \
  -v s3desk-data:/data \
  s3desk:local
```

- 로컬 도메인(예: `s3desk.local`)으로 접속하는 경우 `ALLOWED_HOSTS`에 호스트를 추가해야 Host/Origin 검사에서 차단되지 않습니다.

## 3) Profile 만들기 (Provider별 접속 정보)

Profile은 “스토리지 접속 정보” 입니다.

### S3 / S3-compatible

`rclone` 사용 예시가 아래라면:

```bash
rclone lsd :s3,provider=Other,endpoint=http://object.anonymdog.com,access_key_id=AKIA...,secret_access_key=...:
```

UI에서의 대응은 다음과 같습니다.

- `endpoint` ← `--endpoint-url` 값 (`http://object.anonymdog.com`)
- `accessKeyId` / `secretAccessKey` ← S3(또는 Ceph RGW)에서 발급받은 키
- `region` ← S3 region (Ceph는 보통 `us-east-1` 같은 임의 값으로도 동작하는 경우가 많지만, 환경에 맞게 입력)
- `forcePathStyle`
  - Ceph RGW에서 자주 필요합니다(접속이 안 되면 `true` 로 바꿔보세요).
- `preserveLeadingSlash`
  - 키가 `/`로 시작할 때 선행 `/`를 제거하지 않고 그대로 사용합니다(엄격 S3 semantics).
- `tlsInsecureSkipVerify`
  - 자체서명 인증서/사설 TLS에서 필요할 수 있습니다(가능하면 끄는 것을 권장).

Profile 생성 후 **상단(Profile Select)** 에서 해당 Profile을 선택하면 이후 API 호출에 사용됩니다.

### Azure Blob / GCS / OCI

provider별로 필요한 필드가 다르며, UI에서 provider를 선택하면 입력 폼이 바뀝니다.

- Azure Blob: `accountName`, `accountKey` (+ Azurite면 `useEmulator`, `endpoint`)
- GCS: `serviceAccountJson` 또는 `anonymous=true` (에뮬레이터면 `endpoint`)
  - **버킷 목록/생성/삭제는 `projectNumber`가 필요할 수 있어**, S3Desk에서도 `projectNumber` 없으면 버킷 레벨 API가 `invalid_config`로 실패합니다.
- OCI Object Storage: `region`, `ociNamespace`, `ociCompartment`, `ociConfigFile`, `ociConfigProfile` (선택: `ociEndpoint`)

> 보안 주의: Profile 자격증명은 `DB_BACKEND=sqlite`일 때 `DATA_DIR/s3desk.db`에 저장됩니다(ENCRYPTION_KEY 설정 시 암호화).
> 이 DB는 로컬 전용으로만 보관하고 커밋/공유하지 마세요. 유출 가능성이 있으면 즉시 키를 회전하세요.

### mTLS (클라이언트 인증서) 설정

- mTLS 설정은 **서버에 `ENCRYPTION_KEY`가 설정되어 있어야** 활성화됩니다. 없으면 UI에서 비활성화됩니다.
- Profile 생성/수정 → **Advanced TLS (mTLS)**:
  - Client Certificate / Client Key (PEM) 필수
  - CA Certificate 선택
  - Server Name (SNI) 선택(인증서의 CN/SAN과 일치하도록 지정)
- `tlsInsecureSkipVerify`는 서버 인증서 검증을 건너뛰므로 가급적 끄는 것을 권장합니다.
- Settings → Server → **mTLS (client cert)** 항목에서 서버 활성 여부/사유를 확인할 수 있습니다.

#### mTLS 운영/회전 팁

- `ENCRYPTION_KEY`는 **32바이트 base64 키**여야 합니다.
- `ENCRYPTION_KEY`를 변경하면 기존 mTLS 데이터 복호화가 불가하므로 **각 Profile에서 인증서를 다시 등록**해야 합니다.
- `DB_BACKEND=sqlite`에서 `DATA_DIR/s3desk.db` 백업/복사 시 인증서와 키가 함께 이동되므로 **권한을 엄격히 제한**하세요.

### DB backend 선택 (SQLite/Postgres)

- `DB_BACKEND=sqlite` (기본값)
  - 로컬 파일(`DATA_DIR/s3desk.db`)에 저장됩니다.
  - **SQLite는 1 replica 사용을 권장**합니다.
- `DB_BACKEND=postgres`
  - 외부 DB(`DATABASE_URL`)에 저장됩니다.
  - **Postgres는 multi-replica 구성이 가능**합니다.
  - 필요 시 연결 풀을 조정할 수 있습니다: `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, `DB_CONN_MAX_LIFETIME`, `DB_CONN_MAX_IDLE_TIME`

## 4) 브라우징 / 업로드 / Job 흐름

### Objects (브라우징)

- Bucket 선택 → prefix(폴더) 이동 → object 목록 확인
- 단일 오브젝트 다운로드: 목록의 다운로드 버튼

#### Global Search (Indexed)

- Global Search는 **색인된 데이터**를 대상으로 빠른 검색을 수행합니다.
- 기본 동작은 **현재 prefix(폴더)** 를 기준으로 색인을 자동 생성/갱신합니다.
  - Settings → Objects → **Auto index current prefix** 가 켜져 있을 때만 동작합니다.
  - prefix가 비어 있으면(버킷 루트) 자동 색인을 생략합니다. 필요 시 수동으로 인덱스 작업을 실행하세요.
  - **Auto index TTL (hours)** 보다 오래된 색인은 자동으로 갱신됩니다.
- 수동 색인: Global Search 패널에서 `Create index job`을 사용해 원하는 prefix를 명시적으로 색인할 수 있습니다.

### Uploads (업로드)

업로드는 2단계입니다.

1) **브라우저 → 서버 staging** (진행률/속도/ETA가 UI에 표시됨)
2) **Commit → Job 생성 → 서버에서 rclone으로 업로드** (Jobs 페이지에서 진행률/ETA 확인)

### Jobs

- 긴 작업(대량 삭제/복사/업로드/동기화)은 Job으로 실행됩니다.
- Jobs 페이지에서 bytes/s 및 ETA(초 단위)가 표시됩니다.

## 5) rclone 필요 조건

객체 조회/다운로드와 대부분의 Job 타입(Commit 업로드 포함)은 서버 내부에서 `rclone`을 실행합니다.

- 로컬 실행: `rclone`이 `PATH`에 있거나 `RCLONE_PATH`로 지정되어야 합니다.
- 컨테이너 실행: 호스트의 `rclone` 바이너리를 컨테이너에 마운트하고 `RCLONE_PATH`를 설정하세요.

예시:

```bash
podman run --rm --network host \
  -v s3desk-data:/data \
  -v "$(command -v rclone)":/usr/local/bin/rclone:ro \
  -e RCLONE_PATH=/usr/local/bin/rclone \
  -e JOB_QUEUE_CAPACITY=256 \
  -e JOB_LOG_MAX_LINE_BYTES=262144 \
  s3desk:local
```

Settings → Server 섹션의 Transfer Engine 항목에서 감지 상태/경로를 확인할 수 있습니다.

## 5-1) rclone 경로/서명/에러 호환성

- 경로/프리픽스 정규화
  - API는 key/prefix의 선행 `/`를 제거한 뒤 rclone 경로로 변환합니다.
  - 폴더 생성/복사/이동 계열은 `..`/`.` 세그먼트와 `*` 와일드카드를 허용하지 않습니다.
  - prefix 이동/복사는 trailing `/`가 필요하며, 없으면 오류로 처리합니다.
- 서명/다운로드 URL
  - `/download-url`은 rclone의 `link` 결과를 그대로 반환합니다(스토리지 구현에 따라 path-style/host-style 및 서명 규칙이 다를 수 있음).
  - 엄격한 경로/서명 호환이나 `Content-Disposition` 보장이 필요하면 `proxy=true`로 `/download-proxy`를 사용하세요.
  - `/download-proxy`는 **S3 서명이 아니라 서버 HMAC 서명**(API 토큰 기반)을 사용합니다.
- 에러 의미 통합 (NormalizedError)
  - rclone 오류 메시지는 provider별로 제각각이라, S3Desk는 오류 응답에 `normalizedError`를 같이 실어 보냅니다.
  - `normalizedError.code`는 provider-agnostic 공통 코드이며, UI/자동화 로직은 이 값을 기준으로 처리하는 것을 권장합니다.
  - 대표 코드: `invalid_credentials`, `access_denied`, `not_found`, `rate_limited`, `network_error`, `invalid_config`, `signature_mismatch`, `request_time_skewed`, `conflict`, `upstream_timeout`, `endpoint_unreachable`, `canceled`, `unknown`.
  - `error.code`는 레거시(`s3_error` 등)일 수 있으며, 분류가 가능한 경우에는 `invalid_credentials` 같은 공통 코드가 직접 내려갑니다.

## 6) 자주 나오는 문제

- `401 Unauthorized`:
  - UI Settings의 **X-Api-Token** 값이 서버 `API_TOKEN`과 다르거나, 서버가 토큰을 요구하는 설정인 경우입니다.
- `transfer_engine_missing`:
  - 객체 조회/다운로드 또는 Job 실행 시 서버에서 `rclone`을 찾지 못했습니다. `RCLONE_PATH`/마운트를 확인하세요.
- WSL2에서 `127.0.0.1`로 접속이 안 됨:
  - 포트 매핑/바인딩 설정에 따라 달라질 수 있습니다. 우선 `http://localhost:8080` 를 시도하고, 안 되면 `http://<WSL2 IP>:8080` 로 접속해보세요.

## 7) 운영 튜닝 (Job 큐/로그)

- `JOB_QUEUE_CAPACITY`: Job 큐 최대 대기 수. 꽉 차면 API가 429로 응답합니다.
- `JOB_LOG_MAX_LINE_BYTES`: Job 로그에서 한 줄 최대 길이(초과 시 잘림).
- `LOG_FORMAT=json`: 서버 로그를 JSON Lines로 stdout에 출력합니다(Grafana/Loki/Elastic 수집용).
- `LOG_LEVEL`: 서버 로그 레벨 (`debug`, `info`, `warn`, `error`), 기본값 `info`.
- `LOG_SERVICE`: 로그에 찍힐 서비스명(기본값: `s3desk`).
- `LOG_ENV`: 로그에 찍힐 환경명(기본값: `local`).
- `LOG_VERSION`: 로그에 찍힐 버전 태그(선택).
- `LOG_COMPONENT`: 기본 component 값(선택, 없으면 `"server"`).
- `JOB_LOG_EMIT_STDOUT=true`: Job 로그를 stdout에 JSON Lines로 미러링합니다(파일 로그는 유지).
- `RCLONE_TUNE=true`: rclone 튜닝 활성화(전송/체커 자동 조정).
- `RCLONE_MAX_TRANSFERS`: 전체 전송 수 상한(활성 Job 수로 분배).
- `RCLONE_MAX_CHECKERS`: 전체 체크 수 상한(활성 Job 수로 분배).
- `RCLONE_S3_CHUNK_SIZE_MIB`: S3 multipart chunk size(MiB).
- `RCLONE_S3_UPLOAD_CONCURRENCY`: S3 multipart upload 동시성.
- `RCLONE_STATS_INTERVAL`: rclone stats 출력 간격(예: `2s`, 최소 `500ms`).
- `RCLONE_DOWNLOAD_MULTI_THREAD_STREAMS`: API 다운로드용 멀티스레드 스트림 수(0이면 rclone 기본값).
- `RCLONE_DOWNLOAD_MULTI_THREAD_CUTOFF_MIB`: API 다운로드 멀티스레드 적용 기준 크기(MiB, 0이면 기본값).
- `RCLONE_DOWNLOAD_BUFFER_SIZE_MIB`: API 다운로드 버퍼 크기(MiB, 0이면 기본값).

추천 값:

```bash
JOB_QUEUE_CAPACITY=256
JOB_LOG_MAX_LINE_BYTES=262144
```

### 로그 필드 예시(JSON Lines)

HTTP 요청 로그:

```json
{"ts":"2025-12-26T22:33:45.123Z","level":"info","msg":"http request","service":"s3desk","env":"local","component":"server","event":"http.request","method":"GET","path":"/api/v1/buckets","route":"/buckets","status":200,"duration_ms":12,"bytes":5321,"request_id":"7a2f...","remote_addr":"127.0.0.1","user_agent":"Mozilla/5.0","proto":"HTTP/1.1","profile_id":"p_abc"}
```

Job 로그:

```json
{"ts":"2025-12-26T22:34:01.456Z","level":"info","msg":"job completed","service":"s3desk","env":"local","component":"server","event":"job.completed","job_id":"job_123","job_type":"s3_delete_objects","profile_id":"p_abc","status":"succeeded","duration_ms":1534}
```
