# Provider 지원 범위 / Profile 필드 가이드

S3Desk는 서버 내부에서 `rclone`을 호출해서 스토리지 백엔드에 접근합니다.
즉 **“S3Desk가 지원한다” = “rclone이 해당 백엔드를 지원한다”**에 가깝지만,
UI/DB/API 스키마로 **어떤 옵션을 1급(Profile)으로 노출하느냐**는 S3Desk가 결정합니다.

이 문서는 현재 코드 기준으로 **지원 provider 타입**, **Profile 필드**, **API 기능 범위**를 정리합니다.

## 1) Provider 타입

| Provider | 의미 | rclone backend |
|---|---|---|
| `aws_s3` | AWS S3 (표준) | `s3` (provider=AWS, endpoint optional) |
| `s3_compatible` | S3 호환(Ceph RGW, MinIO 등) | `s3` (provider=Other + endpoint) |
| `oci_s3_compat` | OCI S3-compatible endpoint | `s3` (provider=Other + endpoint) |
| `azure_blob` | Azure Blob Storage | `azureblob` |
| `gcp_gcs` | Google Cloud Storage (GCS) | `google cloud storage` |
| `oci_object_storage` | OCI 네이티브 Object Storage | `oracleobjectstorage` |

> 참고: `aws_s3`는 endpoint를 비워도 AWS 기본 엔드포인트로 동작합니다.
> 반면 `s3_compatible`/`oci_s3_compat`는 **endpoint가 사실상 필수**입니다.


## 2) Profile 필드 요약

### 2-1) `aws_s3` / `s3_compatible` / `oci_s3_compat`

필수:
- `accessKeyId`
- `secretAccessKey`
- `region` (대부분 필요, S3 호환은 관행적으로 `us-east-1`을 쓰는 곳도 있음)

선택:
- `endpoint` (S3 호환/프라이빗 오브젝트 스토리지면 거의 필수)
- `forcePathStyle` (Ceph RGW/일부 호환 구현에서 필요)
- `preserveLeadingSlash`
- `tlsInsecureSkipVerify`
- `tls.*` (mTLS)

### 2-2) `azure_blob`

필수:
- `accountName`
- `accountKey`

선택:
- `endpoint` (Azurite/emulator 또는 프라이빗 엔드포인트에서 필요)
- `useEmulator` (Azurite 사용 시)
- `preserveLeadingSlash`
- `tlsInsecureSkipVerify`
- `tls.*` (mTLS)

### 2-3) `gcp_gcs`

선택/필수(용도별로 다름):
- `serviceAccountJson` (서비스 계정 JSON을 직접 넣는 모드)
- `anonymous=true` (에뮬레이터/퍼블릭 객체 읽기 용도)
- `endpoint` (에뮬레이터 사용 시)

**중요: `projectNumber`**
- rclone의 GCS 백엔드에서 **버킷 목록/생성/삭제**에 `project_number`가 필요할 수 있습니다.
- 그래서 S3Desk에서도 **`GET /buckets`, `POST /buckets`, `DELETE /buckets/{bucket}`** 같은 “버킷 레벨” API는 `projectNumber` 없으면 `invalid_config`로 막습니다.

선택:
- `preserveLeadingSlash`
- `tlsInsecureSkipVerify`
- `tls.*` (mTLS)

### 2-4) `oci_object_storage`

필수:
- `region`
- `namespace`
- `compartment`

선택(환경에 따라 사실상 필수일 수 있음):
- `configFile` (OCI config 파일 경로. 컨테이너 실행이면 보통 볼륨 마운트가 필요)
- `configProfile` (기본값은 OCI SDK의 `DEFAULT` 프로필을 쓰는 경우가 많음)
- `authProvider` (OCI SDK auth provider)
- `endpoint` (리전 기본 endpoint 대신 별도 endpoint를 쓰는 경우)

> 주의: S3Desk 서버가 컨테이너로 실행되는 경우, rclone이 읽을 **OCI config 파일이 컨테이너 안에 존재해야** 합니다.
> 즉, `configFile`을 컨테이너 내부 경로로 맞추고(예: `/data/oci/config`) 그 파일을 볼륨 마운트하는 구성이 필요할 수 있습니다.




## 3) API 기능 범위(현재)

### 지원

- Profile CRUD
- Profile 연결 테스트: `POST /profiles/{id}/test`
- Bucket
  - list: `GET /buckets`
  - create: `POST /buckets`
  - delete: `DELETE /buckets/{bucket}`
- Object
  - list: `GET /buckets/{bucket}/objects`
  - upload/download/delete
- Jobs (copy/sync/delete 등) : 내부적으로 rclone 수행

### 현재 미지원(로드맵에 포함)

- “버킷 정책 / IAM / ACL 정책 편집” 같은 관리 기능
- 수명주기(Lifecycle), CORS, 버전닝, 리텐션 정책, KMS 키 설정

다만 사용자 요구(멀티-클라우드 통합 + 정책 조작)가 명확해져서, 다음과 같이 **단계적으로** 범위를 확장할 계획입니다.

- 1차: S3 계열(`aws_s3`, `s3_compatible`, `oci_s3_compat`, MinIO, Ceph RGW 등)
  - S3 Bucket Policy(JSON) 조회/적용/삭제를 제공
- 2차: GCS
  - Bucket IAM Policy(바인딩) 조작을 S3Desk 공통 모델로 매핑
- 3차: Azure Blob
  - Container public access/ACL(stored access policy) 조작 범위를 정의

Provider마다 정책 모델이 다르기 때문에, "완전히 동일한 UI"가 아니라 **공통 UX(권한 부여/차단, public access, 최소 권한 안내)**를 중심으로 통합하는 방향이 현실적입니다.

## 4) 에러 처리 (NormalizedError)

rclone은 백엔드마다 에러 문자열이 제각각이라, S3Desk는 다음을 같이 반환합니다.

- `error.code`: 기존(레거시) 코드(`s3_error` 등) + 일부 상황에서는 공통 코드
- `error.normalizedError.code`: provider-agnostic 공통 코드
- `error.normalizedError.retryable`: 재시도 가능성(운영/UX용)

UI/자동 재시도 로직은 `normalizedError`를 기준으로 판단하는 것을 권장합니다.
