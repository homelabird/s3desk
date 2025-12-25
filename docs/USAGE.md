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
  -e JOB_QUEUE_CAPACITY=256 \
  -e JOB_LOG_MAX_LINE_BYTES=262144 \
  -v object-storage-data:/data \
  object-storage:local
```

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

> 보안 주의: Profile 자격증명은 `DATA_DIR/object-storage.db`에 저장됩니다(ENCRYPTION_KEY 설정 시 암호화).
> 이 DB는 로컬 전용으로만 보관하고 커밋/공유하지 마세요. 유출 가능성이 있으면 즉시 키를 회전하세요.

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

추천 값:

```bash
JOB_QUEUE_CAPACITY=256
JOB_LOG_MAX_LINE_BYTES=262144
```
