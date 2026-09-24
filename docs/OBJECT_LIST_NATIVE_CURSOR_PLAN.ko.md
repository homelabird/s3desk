# 객체 목록 커서 비용 최적화 분석 및 실행안

2026-09-24 기준. 저장소의 API·인증·목록 구현을 확인하고 각 공급자의 공식 목록 계약을 비교했다. 코드 변경과 배포, 실제 청구 측정은 이 보고서 범위에 포함하지 않는다.

## 결정 요약

**provider-native 커서를 우선 적용한다.** 현재 S3Desk는 S3/AWS/Ceph/MinIO 경로에 이미 `ListObjectsV2` 커서를 사용한다. GCS, Azure Blob, OCI도 공식 API에 페이지 커서가 있으므로, 각 공급자에서 커서 하나로 다음 페이지를 직접 요청하는 것이 비용과 일관성 면에서 맞다.

서버 측 전체 목록 스냅샷은 기본 설계로 쓰지 않는다. 첫 페이지부터 프리픽스 전체를 스캔·저장해야 하고, 임시 데이터 저장량·만료·동시 요청·재시작 처리까지 추가되어 목록 비용을 없애기보다 지연과 저장 비용으로 옮길 수 있다. 커서가 제공되지 않는 비표준 엔드포인트에만 향후 선택형 대안으로 검토한다.

현재 rclone 커서 재검색 상한 100,000은 비용 방어벽이다. 근본 해결은 아니며, 그보다 깊은 페이지에서는 `listing_cursor_too_deep`로 제한된다. 이 오류를 없애기 위해 상한을 무제한으로 높이면 안 된다.

## 현재 코드와 위험

- `backend/internal/api/handlers_object_list_http.go`가 목록 요청을 분기한다. native list가 켜져 있을 때 S3, GCS, Azure 각각 provider cursor를 사용한다. S3는 AWS SDK `ListObjectsV2`, GCS는 JSON API, Azure는 Blob REST `comp=list`를 쓴다. delimiter 생략은 `/`이며 명시적 빈 값은 재귀 목록이다.
- 새 S3 커서는 공급자 continuation token을 다음 요청에 직접 전달한다. 호출당 내부 페이지도 `MaxPagesPerRequest=8`로 제한한다. 기존 `o:/p:` 커서는 롤링 갱신 호환을 위해 rclone 경로에 남아 있다.
- OCI/S3/GCS/Azure native list를 끄거나 지원하지 않는 목록 모드는 rclone `lsjson`으로 목록을 받는다. continuation token이 오면 결과 시작부터 해당 키를 다시 만날 때까지 건너뛴다. 커서 위치가 깊을수록 같은 HTTP 페이지 요청의 비용이 커진다.
- `storage_operations_total`은 논리적인 API 작업을 세고 `storage_api_retries_scheduled_total`은 AWS SDK 재시도 예약을 센다. `storage_rclone_list_entries_scanned_total`은 fallback 목록과 전체 객체 인덱스에서 실제 열거한 항목 수를 공급자·작업별로 보여준다. 이 합계들만으로는 실제 달러 비용을 계산할 수 없다.

## 공급자별 native cursor 계약

| 공급자 | 다음 페이지 계약 | 페이지 크기·목록 모양 | S3Desk 적용 시 확인점 |
|---|---|---|---|
| GCS | JSON API `nextPageToken`을 다음 요청의 `pageToken`으로 전달 | `maxResults`는 `items[]`와 `prefixes[]` 합계 상한이며 권장 최댓값은 1,000. `prefix`와 `/` `delimiter`로 디렉터리 조회 가능. | 현재 서비스 계정 JSON 또는 anonymous 설정, 사용자 지정 `GcpEndpoint`, 폴더/managed-folder 처리. 서비스 계정 인증은 기존 자격증명을 그대로 쓰고 list 권한만 요청. [Objects: list](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list) |
| Azure Blob | 응답 `NextMarker`를 다음 요청의 `marker`로 전달 | `maxresults` 최댓값은 5,000이며 `BlobPrefix`도 결과 수에 포함. 응답이 설정한 수보다 적어도 marker가 올 수 있음. | 현재 account key 및 사용자 지정/emulator endpoint, XML의 `Blob`/`BlobPrefix` 정규화, 폴더 marker 구분. 페이지 종료를 반환 항목 수로 추정하지 말고 marker 유무로 판단. [List Blobs](https://learn.microsoft.com/en-us/rest/api/storageservices/list-blobs) |
| OCI Object Storage | `nextStartWith`를 다음 요청 `start`에 전달 | 한 호출 최대 1,000개. `prefix`, `delimiter`, 선택 필드 사용 가능. OCI는 보통의 `opc-next-page` 대신 `nextStartWith`를 반환함. | namespace, endpoint, 현재 `user_principal_auth`/설정 프로필 사용, delimiter 목록의 `prefixes`와 OCI 폴더 marker 의미 보존. 인증 SDK가 현 프로필 인증 모드를 모두 지원하는지 우선 검증. [OCI list pagination](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/usingapi.htm), [OCI Go SDK ListObjects](https://docs.oracle.com/en-us/iaas/tools/go/latest/objectstorage/index.html) |
| AWS S3 / S3 호환 | `NextContinuationToken`을 `ContinuationToken`으로 전달 | `ListObjectsV2`, 최대 1,000개. | delimiter `/` 및 재귀 목록(`delimiter=""`) 모두 기존 S3 fetcher로 연결됨. MinIO/Ceph/기타 호환 제품은 ListObjectsV2, URL 인코딩, 토큰 왕복, endpoint/path-style 별로 호환성 테스트한 뒤 사용. `S3_NATIVE_LIST=false`인 운영자는 fallback 한계를 그대로 가짐. |

공식 API가 커서를 제공한다는 사실은 커서 페이지마다 고정 비용이 없거나 모든 오브젝트가 같은 단가라는 뜻이 아니다. 공급자·스토리지 클래스·지역별 요금표를 별도 확인한다. 이 작업은 불필요한 재조회와 응답 메타데이터를 줄이는 것이며 저장·egress 비용을 제한하지 않는다.

## 권장 구현 모양

1. **기존 HTTP 응답 계약을 유지한다.** `ListObjectsResponse`의 `items`, `commonPrefixes`, `isTruncated`, `nextContinuationToken`은 바꾸지 않는다. UI와 OpenAPI 변경 없이 backend/provider 경계에 구현한다.
2. **공급자 페이지 fetcher를 하나씩 추가한다.** 각 fetcher는 입력으로 bucket, prefix, delimiter, 최대 항목 수, 커서를 받고 출력으로 공통 `items`, `commonPrefixes`, `next`, `truncated`를 반환한다. `objectlisting`의 bounded paginator를 재사용하고 개별 provider 응답 모델은 adapter에 둔다.
3. **브라우저 토큰은 provider 값을 직접 가정하지 않는다.** 토큰에 버전·공급자·프로필/버킷/프리픽스/delimiter/목록 모드 scope와 provider cursor를 담는다. 다른 scope에서 재사용하면 400 refresh 오류를 돌려준다. 토큰 변경·공급자 전환은 목록 새로고침으로 처리한다.
4. **페이지 요청은 제한한다.** UI의 `maxKeys` 상한 1,000을 유지한다. 한 HTTP 호출에서 불필요한 provider page를 계속 당겨 결과를 채우지 말고, 짧거나 빈 페이지라도 다음 커서가 있으면 잘린 응답과 토큰을 반환한다. provider SDK 자체 재시도도 작게 제한하고 취소/timeout을 전파해 재시도 곱셈을 막는다.
5. **필요 필드만 요청한다.** 목록 화면이 쓰는 이름·크기·수정 시각·etag 범위만 요청한다. 태그, 사용자 metadata, ACL, 버전 목록, 별도 HEAD/GET은 화면이 요구하지 않으면 가져오지 않는다.
6. **모드 변경을 fail-closed로 처리한다.** 예전 `o:/p:` token을 새 adapter에 전달하지 않는다. 현재처럼 모드 전환 시 “refresh listing” 오류를 내고 첫 페이지부터 다시 시작한다.

`objectlisting`은 provider cursor, scope 토큰, 결과 상한만 공유한다. 개별 provider의 XML/JSON 모델은 provider adapter에 둔다.

## 실행 순서

### 0. 기존 S3 fetcher의 재귀 목록 연결 — 완료

기존 `ListObjectsV2` fetcher에 명시적 빈 delimiter 경로를 연결했고 frontend client도 `delimiter=`를 보존하도록 했다. `objectlisting` scope에 delimiter가 들어가므로 folder-style과 recursive token을 섞어 쓸 수 없다. 기본 `/` 동작은 유지한다. 신규 dependency는 없다. fake S3 HTTP API로 재귀 첫/후속 페이지가 continuation token을 왕복하고 provider 호출 2회로 끝나는 것을 검증했다. 이는 ListObjectsV2 호환 Ceph/MinIO도 이론상 넓히지만, 각 제품 실계정 검증은 별도다.

### 1. GCS — 로컬 구현 완료, 운영 canary 미완료

GCS JSON API `pageToken`을 연결했다. 기존 API 응답과 공통 bounded paginator를 유지하고 `gcsv1.` 토큰 scope로 공급자·프로필·bucket·prefix·delimiter를 묶는다. 서비스 계정/anonymous 인증과 사용자 지정 endpoint를 기존 GCS HTTP 경로에서 재사용하며, 요청 필드는 객체 목록에 필요한 필드로 제한했다. `GCS_NATIVE_LIST=false`로 rclone fallback을 선택할 수 있다. fake API 테스트는 cursor 왕복, 항목 매핑, 모드 간 토큰 거부, 비밀을 감춘 HTTP 오류를 확인한다.

실 GCS 계정의 IAM 권한, endpoint 동작, 청구 변화는 아직 검증하지 않았다.

### 2. Azure Blob — 로컬 구현 완료, 운영 canary 미완료

Azure Blob REST `comp=list`를 연결하고 응답 `NextMarker`를 다음 요청의 `marker`로 전달한다. `Blob`과 `BlobPrefix`를 공통 결과로 매핑하고 marker가 비어 있을 때만 페이지 종료로 판단한다. 기존 Shared Key 서명, endpoint 선택, TLS 검증, outbound URL guard를 `azureutil`로 공유한다. `AZURE_NATIVE_LIST=false`로 rclone fallback을 선택할 수 있다. fake API 테스트는 cursor 왕복, 폴더 prefix, 키 서명 형식, 응답 오류 안전 처리를 확인한다.

실 Azure 계정 및 Azurite 외 endpoint의 호환성과 청구 변화는 검증하지 않았다. 다음은 OCI `nextStartWith`다.

### 3. OCI — 로컬 구현 완료, 운영 canary 미완료

기존 `ocicli` 경계를 재사용해 `oci os object list` 단일 페이지 호출을 추가했다. `--limit`, `--start`, prefix, delimiter, 필요한 필드만 사용하고 응답 `next-start-with`를 `ociv1.` continuation token에 넣는다. 기존 config file/profile, region, endpoint, `user_principal_auth`/instance/resource principal 선택을 그대로 전달한다. 전체 페이지를 자동으로 가져오는 `--all`은 사용하지 않고 CLI 재시도도 끈다. OCI CLI 문서는 `--all`이 모든 페이지를 가져오며 `--limit`과 함께 사용할 수 없다고 명시하고, `--start`/`next-start-with`를 페이지 재개 방식으로 설명한다. [OCI CLI object list](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/object/list.html). `OCI_NATIVE_LIST=false`로 rclone fallback을 선택할 수 있다. fake CLI로 인자, 데이터 매핑, marker 왕복, 호출 수를 확인한다.

OCI SDK dependency나 인증 저장 형식을 추가하지 않았다. 실제 tenancy에서 IAM 권한·user/instance/resource principal 동작·청구 변화는 아직 검증하지 않았다.

### 4. 오래된 fallback 단계적 축소

세 provider 각각 local contract와 가용한 emulator를 통과시킨 뒤 provider별 운영 canary로 켠다. 회귀가 있으면 해당 provider만 rclone으로 되돌리고, cursor mode가 달라진 클라이언트에는 새로고침 오류를 반환한다. 모든 공급자를 한 번에 전환하지 않는다.

## 서버 스냅샷 비교

| 선택 | 좋은 점 | 비용·운영 부담 | 판정 |
|---|---|---|---|
| Provider-native cursor | 각 페이지에서 필요한 범위만 읽고 공급자 자체 cursor로 이어감. 데이터가 커도 이전 페이지를 재조회하지 않음. | 공급자별 API·인증·응답 매핑 및 호환 테스트가 필요. | 네 provider가 공식 cursor를 제공하므로 기본 권장. |
| 전체 목록을 첫 요청에 스냅샷 | 이후 페이지는 파일/DB 순차 읽기라 공급자 재조회가 없음. | 첫 페이지 표시 전에 프리픽스 전체를 스캔, 큰 목록의 임시 저장/정리, stale 목록, 다중 요청 동시성, 서버 재시작 처리. 큰 버킷 첫 화면의 비용과 지연이 커짐. | 기본 적용하지 않음. |
| 명시적인 전체 인덱스 작업 후 DB 탐색 | 검색과 반복 탐색에서 원격 목록 호출을 재사용할 수 있음. | 명시적 전수 스캔 비용, 저장 용량, stale/index update 정확도 관리. 이미 객체 인덱싱 기능이 있으나 사용자가 선택해야 함. | 전체 검색/반복 분석에 한정해 사용. 일반 목록의 암묵적 대체재로 쓰지 않음. |

## 회귀·비용 검증 기준

- HTTP 첫 페이지와 다음 페이지의 upstream cursor가 정확히 이어지며, 두 번째 요청이 첫 페이지의 객체를 다시 열거하지 않는다.
- `maxKeys=1`, 기본 500, 상한 1,000, 빈 페이지 + next cursor, 중복/잘못된 cursor, 다른 profile/bucket/prefix/delimiter의 cursor를 검증한다.
- prefix-only와 folder marker, 이름에 `+`, `%`, Unicode, slash가 있는 객체, snapshot/version 포함 안 함 동작을 검증한다.
- 취소·timeout·403·404·429·5xx 및 SDK retry ceiling을 검증한다. 에러 메시지에 자격 증명, 서명 URL, provider 원문을 노출하지 않는다.
- fake server에서 페이지당 기대 upstream 요청이 1회이고, cursor 깊이가 커져도 요청 수가 증가하지 않음을 확인한다. retry는 별도 집계한다.
- `storage_list_page_requests_total{provider,status}`는 native cursor의 페이지 fetcher마다 증가한다. `storage_operations_total`은 API 단위 작업, `storage_rclone_list_entries_scanned_total`은 fallback 재열거와 `operation="object_index"` 인덱스 스캔을 보여주므로 세 지표와 retry 계측을 함께 본다. provider/status 외 label은 추가하지 않았다.
- emulator/unit 성공을 실계정 검증으로 간주하지 않는다. 각 클라우드 테스트 계정에서 2개 이상 페이지, 권한, 비용보고서 상의 요청 변화까지 확인하기 전에는 provider-live 호환 완료로 표시하지 않는다.

## 남은 작업

S3 재귀 목록과 GCS/Azure/OCI native cursor 및 provider별 page-request counter는 로컬 계약 테스트까지 완료했다. 임시 MinIO 인스턴스와 두 객체를 사용해 native S3 호환 목록의 첫 페이지/continuation 페이지도 통과했다. Grafana 대시보드 JSON, opt-in PrometheusRule, import 절차가 있고 Helm은 대시보드를 sidecar가 찾을 수 있는 opt-in ConfigMap으로도 렌더링한다. 남은 작업은 **실제 Prometheus/Grafana 배포에 연결**, AWS/GCS/Azure/OCI 실계정 canary, 운영 MinIO 버전과 Ceph RGW 호환 확인이다. 전체 목록 캐시를 먼저 넣지 않는다.

## 이번 구현 검증

- `THUMBNAIL_CACHE_TTL=24h go test ./internal/objectlisting ./internal/s3client ./internal/gcsbucket ./internal/api ./cmd/server`: 통과
- `THUMBNAIL_CACHE_TTL=24h go test ./internal/azureutil ./internal/azureacl ./internal/azureblob ./internal/objectlisting ./internal/api ./cmd/server`: 통과
- `THUMBNAIL_CACHE_TTL=24h go test ./internal/ocicli ./internal/objectlisting ./internal/api ./cmd/server`: 통과
- `THUMBNAIL_CACHE_TTL=24h go test ./internal/objectlisting ./internal/s3client ./internal/gcsbucket ./internal/azureutil ./internal/azureacl ./internal/azureblob ./internal/ocicli ./internal/metrics ./internal/api ./cmd/server -count=1`: 통과
- `./scripts/check_helm_chart.sh`: 통과
- e2e, portable-smoke, demo, 개발 Compose 설정 검사: 통과
- `OCI_NATIVE_LIST`, Compose, Helm `objectListing.ociNativeList`로 OCI native list를 켜고 끌 수 있다. 앞선 provider도 각자의 설정값을 제공한다.
- `npx vitest run src/api/__tests__/objects.test.ts`: 8 tests 통과
- `npm run gen:openapi` 및 `npm run check:openapi`: 통과
- `git diff --check`: 통과

이번 MinIO 검증은 임시 local MinIO `RELEASE.2025-09-07T16-13-09Z`에서 API connectivity와 2-object continuation pagination을 확인한 local runtime 증거다. 실제 배포 MinIO, AWS, Ceph, 비용 청구 또는 배포 운영 증거는 아니다. 나머지 listed checks는 fake provider/API 및 local code evidence다.

보고서 작성 시 현재 설정에서 확인한 인증은 GCS service account/anonymous, Azure account key, OCI config/user principal 경로다. 다른 인증 방식과 실제 endpoint 동작은 대상 배포 설정 또는 provider 계정에서 별도 검증해야 한다.
