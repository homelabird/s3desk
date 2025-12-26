# 사용법 (Local Object Storage Dashboard)

이 프로젝트는 **S3 호환(Object Storage/Ceph RGW 등)** 스토리지를 웹 UI로 조회하고, `s5cmd` 기반의 대량 작업(업로드/삭제/복사/동기화 Job)을 실행할 수 있는 대시보드입니다.

## 1) 실행 후 접속

- 기본 접속: `http://127.0.0.1:8080` 또는 `http://localhost:8080`
- WSL2/컨테이너 포트매핑으로 실행하는 경우: `http://<WSL2 IP>:8080` 로도 접속될 수 있습니다.
  - 브라우저 콘솔에 `Cross-Origin-Opener-Policy ... untrustworthy` 경고가 뜨면 `localhost` 로 접속하는 것을 권장합니다(HTTP+IP 조합은 “신뢰할 수 없는 origin”으로 분류될 수 있음).

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
  -e ALLOWED_HOSTS=object-storage.local \
  -e JOB_QUEUE_CAPACITY=256 \
  -e JOB_LOG_MAX_LINE_BYTES=262144 \
  -v object-storage-data:/data \
  object-storage:local
```

- 로컬 도메인(예: `object-storage.local`)으로 접속하는 경우 `ALLOWED_HOSTS`에 호스트를 추가해야 Host/Origin 검사에서 차단되지 않습니다.

## 3) Profile 만들기 (S3/CEPH 접속 정보)

Profile은 “S3 접속 정보” 입니다. `s5cmd` 사용 예시가 아래라면:

```bash
s5cmd --profile ceph-store1 --endpoint-url http://object.anonymdog.com ls
```

UI에서의 대응은 다음과 같습니다.

- `endpoint` ← `--endpoint-url` 값 (`http://object.anonymdog.com`)
- `accessKeyId` / `secretAccessKey` ← S3(또는 Ceph RGW)에서 발급받은 키
- `region` ← S3 region (Ceph는 보통 `us-east-1` 같은 임의 값으로도 동작하는 경우가 많지만, 환경에 맞게 입력)
- `forcePathStyle`
  - Ceph RGW에서 자주 필요합니다(접속이 안 되면 `true` 로 바꿔보세요).
- `tlsInsecureSkipVerify`
  - 자체서명 인증서/사설 TLS에서 필요할 수 있습니다(가능하면 끄는 것을 권장).

Profile 생성 후 **상단(Profile Select)** 에서 해당 Profile을 선택하면 이후 API 호출에 사용됩니다.

> 보안 주의: Profile 자격증명은 `DB_BACKEND=sqlite`일 때 `DATA_DIR/object-storage.db`에 저장됩니다(ENCRYPTION_KEY 설정 시 암호화).
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
- `DB_BACKEND=sqlite`에서 `DATA_DIR/object-storage.db` 백업/복사 시 인증서와 키가 함께 이동되므로 **권한을 엄격히 제한**하세요.

### DB backend 선택 (SQLite/Postgres)

- `DB_BACKEND=sqlite` (기본값)
  - 로컬 파일(`DATA_DIR/object-storage.db`)에 저장됩니다.
  - **SQLite는 1 replica 사용을 권장**합니다.
- `DB_BACKEND=postgres`
  - 외부 DB(`DATABASE_URL`)에 저장됩니다.
  - **Postgres는 multi-replica 구성이 가능**합니다.

## 4) 브라우징 / 업로드 / Job 흐름

### Objects (브라우징)

- Bucket 선택 → prefix(폴더) 이동 → object 목록 확인
- 단일 오브젝트 다운로드: 목록의 다운로드 버튼

### Uploads (업로드)

업로드는 2단계입니다.

1) **브라우저 → 서버 staging** (진행률/속도/ETA가 UI에 표시됨)
2) **Commit → Job 생성 → 서버에서 s5cmd로 S3 업로드** (Jobs 페이지에서 진행률/ETA 확인)

### Jobs

- 긴 작업(대량 삭제/복사/업로드/동기화)은 Job으로 실행됩니다.
- Jobs 페이지에서 bytes/s 및 ETA(초 단위)가 표시됩니다.

## 5) s5cmd 필요 조건

일부 Job 타입(Commit 업로드 포함)은 서버 내부에서 `s5cmd`를 실행합니다.

- 로컬 실행: `s5cmd`가 `PATH`에 있거나 `S5CMD_PATH`로 지정되어야 합니다.
- 컨테이너 실행: 호스트의 `s5cmd` 바이너리를 컨테이너에 마운트하고 `S5CMD_PATH`를 설정하세요.

예시:

```bash
podman run --rm --network host \
  -v object-storage-data:/data \
  -v "$(command -v s5cmd)":/usr/local/bin/s5cmd:ro \
  -e S5CMD_PATH=/usr/local/bin/s5cmd \
  -e JOB_QUEUE_CAPACITY=256 \
  -e JOB_LOG_MAX_LINE_BYTES=262144 \
  object-storage:local
```

Settings → Server 섹션의 `s5cmd` 항목에서 감지 상태/경로를 확인할 수 있습니다.

## 6) 자주 나오는 문제

- `401 Unauthorized`:
  - UI Settings의 **X-Api-Token** 값이 서버 `API_TOKEN`과 다르거나, 서버가 토큰을 요구하는 설정인 경우입니다.
- `s5cmd_missing`:
  - Commit 업로드 또는 s5cmd 기반 Job 실행 시 서버에서 `s5cmd`를 찾지 못했습니다. `S5CMD_PATH`/마운트를 확인하세요.
- WSL2에서 `127.0.0.1`로 접속이 안 됨:
  - 포트 매핑/바인딩 설정에 따라 달라질 수 있습니다. 우선 `http://localhost:8080` 를 시도하고, 안 되면 `http://<WSL2 IP>:8080` 로 접속해보세요.

## 7) 운영 튜닝 (Job 큐/로그)

- `JOB_QUEUE_CAPACITY`: Job 큐 최대 대기 수. 꽉 차면 API가 429로 응답합니다.
- `JOB_LOG_MAX_LINE_BYTES`: Job 로그에서 한 줄 최대 길이(초과 시 잘림).
- `LOG_FORMAT=json`: 서버 로그를 JSON Lines로 stdout에 출력합니다(Grafana/Loki/Elastic 수집용).
- `JOB_LOG_EMIT_STDOUT=true`: Job 로그를 stdout에 JSON Lines로 미러링합니다(파일 로그는 유지).
- `S5CMD_TUNE=true`: s5cmd 튜닝 활성화(병렬/파트 크기 자동 조정).
- `S5CMD_MAX_NUMWORKERS`: 전체 워커 수 상한(활성 Job 수로 분배).
- `S5CMD_MAX_CONCURRENCY`: 전체 동시성 상한(활성 Job 수로 분배).
- `S5CMD_MIN_PART_SIZE_MIB`: 파트 최소 크기(MiB).
- `S5CMD_MAX_PART_SIZE_MIB`: 파트 최대 크기(MiB).
- `S5CMD_DEFAULT_PART_SIZE_MIB`: 평균 오브젝트 크기 추정이 불가할 때 기본 파트 크기(MiB).

추천 값:

```bash
JOB_QUEUE_CAPACITY=256
JOB_LOG_MAX_LINE_BYTES=262144
```
