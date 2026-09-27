# Bucket governance validation matrix

Checked 2026-09-27. Rules revision: `2026-09-27.21`.
This inventories the implemented editing surface, provider contracts, and remaining
coverage gaps. It is not a provider certification or a claim that all combinations
have been tested. Actual provider accounts, regions, products and versions have not
been identified by live evidence in this worktree.

## Enforcement owners

- HTTP shape/presence and raw JSON: `backend/internal/api/handlers_bucket_governance_*`, `handlers_bucket_policy_validate*`.
- Typed common checks: `backend/internal/bucketgov/validate*.go`; provider state checks and readback: the corresponding adapter.
- AWS lifecycle parser: `backend/internal/bucketgov/aws_lifecycle.go`.
- GCS IAM/raw: `backend/internal/gcsiam`; Azure ACL/raw: `backend/internal/azureacl`.
- UI builders: `frontend/src/pages/buckets/governance/requestBuilders.ts`; these are not a security boundary.
- Every mutation needs authenticated provider authority. Local validation and readback do not prove effective permissions.

## AWS S3 (general purpose bucket editing surface)

| Input | Field/unit/combination contract and current enforcement | Remaining provider evidence |
|---|---|---|
| Public exposure | Four boolean Block Public Access flags. Adapter compares all flags after writing. `mode` is an application convenience; account/organization restrictions can still override bucket settings. [API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutPublicAccessBlock.html) | Effective anonymous/authenticated access; directory buckets are not covered by this surface. |
| Ownership | Three application enum values map to BucketOwnerEnforced/BucketOwnerPreferred/ObjectWriter. Missing current ownership is not guessed. [API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketOwnershipControls.html) | Existing ACL prerequisites and resulting object ownership. |
| Versioning | Only enabled/suspended writes; disabled is not a valid S3 write. HTTP compares before/requested/after. [API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketVersioning.html) | MFA-delete and Object Lock/account constraints; resulting object versions. |
| Encryption | Editor supports SSE-S3/SSE-KMS; SSE-S3 rejects a KMS identifier. Adapter preserves existing DSSE, Bucket Key and encryption restrictions and compares readback. [API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketEncryption.html) | KMS authority, key identity normalization and actual new-object encryption. |
| Lifecycle | Array, at most 1000 rules; whole replacement, empty array uses delete. Parser checks status, filters/tags/size bounds, date/day alternatives, midnight-UTC dates, at least one action per rule, and optional noncurrent retained-version counts in 1..100. Normalized rules always include a Filter, including for retained-version counts. Existing minimum-size behavior is preserved. [API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketLifecycleConfiguration.html) | Full transition/storage-class timing combinations, directory-bucket distinctions and lifecycle execution. |
| Raw bucket policy | JSON policy lint is required on PUT. Whole-object readback comparison normalizes statement/set order while retaining unknown fields. | Full IAM condition/action/resource semantics and effective allow/deny require AWS validation and live checks; static lint is not an IAM evaluator. |

## Google Cloud Storage

| Input | Field/unit/combination contract and current enforcement | Remaining provider evidence |
|---|---|---|
| IAM bindings/raw | Nonempty role/member values; condition shape; loaded ETag required; conditional version 3 handling. Typed readback compares all bindings/conditions ignoring order; raw ignores only changing ETag and normalizes binding/member order. [setIamPolicy](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/setIamPolicy) | Principal/role existence, CEL semantics and actual permissions. |
| Public mode/PAP | private/public and boolean prevention. IAM update followed by metadata update can partially apply; API reports partial state instead of hiding it. [Bucket resource](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets) | Inherited prevention, IAM authority, policy propagation and effective public access. |
| Uniform access | Boolean metadata update with requested-field readback. Disable preflight rejects hierarchical namespace, missing current state, expired/missing/invalid lock deadline, unreadable IAM policy, missing IAM revision and conditional bucket bindings. [Bucket resource](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets) | Organization constraints and managed folders remain provider-enforced. Preflight does not atomically lock IAM/metadata; restored ACL grants and actual access require live evidence. |
| Versioning | enabled/disabled mapped to boolean metadata; requested-field readback and HTTP status comparison. [Bucket resource](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets) | Object version behavior and conflicting provider settings. |
| Retention | S3Desk accepts whole days, 1..36525 when enabled; converts using 64-bit seconds. Provider maximum is 3155760000 seconds. Locked policies are read-only in this client, even where the provider allows extension. Non-whole-day observations are disclosed rather than silently described as exact days. [Limits](https://docs.cloud.google.com/storage/quotas) | Metageneration conditional writes and provider lock/organization constraints. |

## Azure Blob Storage

| Input | Field/unit/combination contract and current enforcement | Remaining provider evidence |
|---|---|---|
| Public mode | private/blob/container; raw requires explicit mode and policy array. Typed public changes preserve stored policies and compare readback. [ACL API](https://learn.microsoft.com/en-us/rest/api/storageservices/set-container-acl) | Account-level anonymous-access policy and actual anonymous access. |
| Stored policies/raw ACL | At most 5; unique nonempty IDs of at most 64 characters; permission alphabet/order; ISO date/time parsing. Empty list removes policies. Readback checks complete lists and normalizes equivalent timestamps. [ACL API](https://learn.microsoft.com/en-us/rest/api/storageservices/set-container-acl) | SAS effectiveness and propagation; account/API-version-specific permission support. |
| Soft delete | Enabled retention 1..365 days; explicit enabled required in provider response. This setting is account/blob-service scoped, not isolated to the selected container. [Overview](https://learn.microsoft.com/en-us/azure/storage/blobs/soft-delete-blob-overview) | Account-wide impact and restore behavior; no conditional-write guarantee. |
| Immutability | Enabled duration 1..146000 days; unlocked/locked; mutually exclusive append flags. Existing policy edits require the loaded ETag; missing/stale revisions fail before writes. Locked state constrains edits; response revision required before locking. [Range](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview), [ARM contract](https://learn.microsoft.com/en-us/rest/api/storagerp/blob-containers/create-or-update-immutability-policy?view=rest-storagerp-2024-01-01) | Real lock/extension behavior, account features and read-to-create race for absent policies. |
| Legal hold | Normalized unique alphanumeric tags, 3..23 characters; final tag set/active state comparison. Separate from time retention; tag values excluded from audit logs. | Actual enforcement and simultaneous tag edits; no CAS guarantee. |
| Versioning | enabled/disabled via ARM blob-service settings; account scope and runtime prerequisites apply. | HNS/account compatibility and version creation; UI capability alone is insufficient. |

## OCI Object Storage

| Input | Field/unit/combination contract and current enforcement | Remaining provider evidence |
|---|---|---|
| Public mode | private/object_read/object_read_without_list mapping; exact observed visibility after write. | Actual list/read behavior and tenancy restrictions. |
| Versioning | enabled/suspended only. HTTP status readback required. Retention and enabled versioning conflict in the provider. [Retention interactions](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules.htm) | Enabling versioning first requires a complete empty retention list; applying retention first requires observed Disabled/Suspended versioning. Read failures block writes. The read-to-write race and replication/account constraints remain. |
| Retention | Up to 100 rules; editor preserves positive whole DAYS/YEARS or explicit indefinite duration. Provider lock time is timestamp/null, with future lock distinct from active lock; immutable rules cannot be removed/shortened. Whole final list/ID/name/duration/lock timestamp compared. [SDK limit](https://docs.public.content.oci.oraclecloud.com/en-us/iaas/tools/java/3.63.3/com/oracle/bmc/objectstorage/ObjectStorageClient.html), [Rules](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules.htm) | Native units and indefinite rules are represented losslessly. Locked edits retain their original unit; new/cancelled lock scheduling remains outside current editor support. Real CLI/service duration transitions remain unverified. |
| PAR sharing | Provider has no fixed PAR-count limit: the incorrect 100-item API/UI restriction was removed. New requests require name, supported access type and RFC3339 expiry; listing action is Deny/ListObjects; new write-only PARs cannot request ListObjects. Existing provider access types are displayed and preserved exactly by the read-only editor. Existing IDs are preserved; CLI lists all pages. Object targets retain exact whitespace through UI, adapter, CLI and readback; only the empty value selects bucket-wide scope. Whole inventory is compared after writes; expiration timestamps use instant equality and missing/invalid timestamps cannot confirm a write. IDs are case-sensitive. Signed URLs are never audited. [PAR constraints](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingpreauthenticatedrequests.htm) | Object/prefix-specific access types, expiration/permission combinations and actual URL effects require further coverage. |

## S3-compatible and Ceph

Only raw policy capability is enabled in the current generic compatible-provider
surface. Do not infer AWS feature support from protocol similarity. [Ceph documents
its own supported policy subset](https://docs.ceph.com/en/latest/radosgw/bucketpolicy/).
Pin the deployed Ceph release and endpoint before testing action, condition, tenant
and principal semantics. The `latest` reference is orientation, not evidence for
an unidentified installation. Other S3-compatible products require their own
product/version references and live results.

## Evidence and outstanding completion checks

`provider_limits_test.go` covers upper boundaries, zero/negative input and the
removed PAR-count limit; existing adapter/readback tests cover simulated errors,
read mismatches, and cancellation. These prove local code behavior only.

Unfinished work is explicit: exhaustive lifecycle combinations, OCI live duration transitions
and remaining replication/account combinations, complete principal/condition
semantics where feasible, product/version identification, and real allow/deny,
conflict, failure and recovery checks. Request review and readback cannot close
those gaps. See `ISSUE_39_WORKLOG.md` for commands and actual outcomes.

### Lifecycle contract refresh (2026-09-27)

AWS removed the old 30-day minimum for transitions from Standard to Standard-IA
and One Zone-IA on 2026-07-16. Do not add that obsolete restriction to the
validator; current `days: 0` acceptance matches the announcement. This does not
remove storage billing minimums or prove every multi-transition combination.
[Official change](https://aws.amazon.com/about-aws/whats-new/2026/07/s3-removes-30-day-transitions-standard-ia-one-zone-ia/).

The noncurrent retained-version lower bound and mandatory-action checks use the
[Lifecycle element contract](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html)
and [S3 error contract](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ErrorCodeBilling.html).
Tests cover 0/1/100/101, each supported action family, and HTTP rejection before
provider writes. Optional omitted retained-version counts remain supported.
