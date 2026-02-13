# Provider 지원 범위 / Profile 필드 가이드

S3Desk는 서버 내부에서 `rclone`을 호출해서 스토리지 백엔드에 접근합니다.
즉 **“S3Desk가 지원한다” = “rclone이 해당 백엔드를 지원한다”**에 가깝지만,
UI/DB/API 스키마로 **어떤 옵션을 1급(Profile)으로 노출하느냐**는 S3Desk가 결정합니다.

이 문서는 현재 코드 기준으로 **지원 provider 타입**, **Profile 필드**, **API 기능 범위**를 정리합니다.

## 0) 지원 등급(Tier) 정의

- **Tier 1**: CI에서 provider smoke가 돌아가며, 핵심 플로우(연결 테스트, 버킷/오브젝트 기본 CRUD, 전송 Job)가 검증됩니다.
- **Tier 2**: UI/스키마에서 제공되지만 자동화 테스트 커버리지가 낮아, 환경별 수동 검증이 필요합니다.

## 0-1) Provider별 등급/범위

| Provider | Tier | 핵심 지원 범위 | 제약/비고 |
|---|---|---|---|
| AWS S3 | Tier 1 | Profile CRUD, 연결 테스트, 버킷 list/create/delete, 오브젝트 list/upload/download/delete, 전송 Job | 기본 AWS 엔드포인트 사용 가능 |
| S3 호환 스토리지(Ceph, MinIO 등) | Tier 1 | Profile CRUD, 연결 테스트, 버킷/오브젝트 기본 CRUD, 전송 Job | CI 검증은 MinIO 기준, 환경별 `endpoint`/`forcePathStyle` 차이 존재 |
| Azure Blob Storage | Tier 1 | Profile CRUD, 연결 테스트, 컨테이너 list/create/delete, 오브젝트 list/upload/download/delete, 전송 Job | CI 검증은 Azurite 기준 |
| Google Cloud Storage(GCS) | Tier 1 | Profile CRUD, 연결 테스트, 버킷/오브젝트 기본 CRUD, 전송 Job | 버킷 레벨 API는 `projectNumber` 필요할 수 있음 |
| OCI S3-compatible | Tier 2 | Profile CRUD, 연결 테스트, 버킷/오브젝트 기본 CRUD, 전송 Job | S3 호환으로 동작하나 자동화 커버리지 낮음 |
| OCI Object Storage (native) | Tier 2 | Profile CRUD, 연결 테스트, 버킷/오브젝트 기본 CRUD, 전송 Job | OCI config 파일/compartment 설정 필요, 자동화 커버리지 낮음 |

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

## 1-1) 런타임 Capability Matrix (`/meta`)

서버는 `GET /api/v1/meta`의 `capabilities.providers`에 provider별 기능 플래그를 제공합니다.

- 공통: `bucketCrud`, `objectCrud`, `jobTransfer`, `directUpload`
- 정책: `bucketPolicy`, `gcsIamPolicy`, `azureContainerAccessPolicy`
- 업로드: `presignedUpload`, `presignedMultipartUpload`
- 사유: `reasons.*` (해당 capability가 `false`일 때 provider별/서버설정별 비활성 사유)

UI는 하드코딩 대신 이 매트릭스를 우선 사용해 provider별 미지원 기능을 숨기거나 비활성화해야 합니다.
구버전 서버 호환을 위해 fallback 매트릭스를 함께 유지할 수 있습니다.


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

- 수명주기(Lifecycle), CORS, 버전닝, 리텐션 정책, KMS 키 설정

### 버킷 정책 / IAM / ACL (현재 지원 범위)

아래 provider는 버킷 정책 관리 API/UI를 지원합니다.

- S3 계열(`aws_s3`, `s3_compatible`, `oci_s3_compat`, MinIO, Ceph RGW 등)
  - S3 Bucket Policy(JSON) `GET/PUT/DELETE`
- GCS
  - Bucket IAM Policy(JSON) `GET/PUT`
  - `DELETE`는 미지원 (`bucket_policy_delete_unsupported` 반환, 정책은 `PUT`으로 갱신)
- Azure Blob
  - Container access policy(JSON) `GET/PUT/DELETE` (public access + stored access policies)

Provider마다 정책 모델이 달라 "완전히 동일한 JSON"은 아니며, S3Desk는 공통 UX(정책 조회/수정/검증/적용)를 제공합니다.

## 4) 에러 처리 (NormalizedError)

rclone은 백엔드마다 에러 문자열이 제각각이라, S3Desk는 다음을 같이 반환합니다.

- `error.code`: 기존(레거시) 코드(`s3_error` 등) + 일부 상황에서는 공통 코드
- `error.normalizedError.code`: provider-agnostic 공통 코드
- `error.normalizedError.retryable`: 재시도 가능성(운영/UX용)

UI/자동 재시도 로직은 `normalizedError`를 기준으로 판단하는 것을 권장합니다.
