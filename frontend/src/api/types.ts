// Do not edit src/api/openapi.ts manually. Update ../openapi.yml and regenerate via `npm run gen:openapi`.
import type { components } from "./openapi";

export type ErrorResponse = components["schemas"]["ErrorResponse"];

export type Profile = components["schemas"]["Profile"];
export type ProfileCreateRequest =
  components["schemas"]["ProfileCreateRequest"];
export type ProfileUpdateRequest =
  components["schemas"]["ProfileUpdateRequest"];
export type ProfileTestResponse = components["schemas"]["ProfileTestResponse"];
export type ProfileBenchmarkResponse =
  components["schemas"]["ProfileBenchmarkResponse"];

export type ProfileTLSMode = components["schemas"]["ProfileTLSMode"];
export type ProfileTLSConfig = components["schemas"]["ProfileTLSConfig"];
export type ProfileTLSStatus = components["schemas"]["ProfileTLSStatus"];

export type Bucket = components["schemas"]["Bucket"];
export type BucketCreateRequest = components["schemas"]["BucketCreateRequest"];
export type BucketGovernanceView =
  components["schemas"]["BucketGovernanceView"];
export type BucketAdvancedView = components["schemas"]["BucketAdvancedView"];
export type BucketAccessView = components["schemas"]["BucketAccessView"];
export type BucketAccessBinding =
  components["schemas"]["BucketAccessBinding"];
export type BucketAccessPutRequest =
  components["schemas"]["BucketAccessPutRequest"];
export type BucketStoredAccessPolicy =
  components["schemas"]["BucketStoredAccessPolicy"];
export type BucketPublicExposureView =
  components["schemas"]["BucketPublicExposureView"];
export type BucketPublicExposureMode =
  components["schemas"]["BucketPublicExposureMode"];
export type BucketPublicExposurePutRequest =
  components["schemas"]["BucketPublicExposurePutRequest"];
export type BucketProtectionView =
  components["schemas"]["BucketProtectionView"];
export type BucketProtectionPutRequest =
  components["schemas"]["BucketProtectionPutRequest"];
export type BucketRetentionView =
  components["schemas"]["BucketRetentionView"];
export type BucketSoftDeleteView =
  components["schemas"]["BucketSoftDeleteView"];
export type BucketImmutabilityView =
  components["schemas"]["BucketImmutabilityView"];
export type BucketVersioningView =
  components["schemas"]["BucketVersioningView"];
export type BucketVersioningPutRequest =
  components["schemas"]["BucketVersioningPutRequest"];
export type BucketEncryptionView =
  components["schemas"]["BucketEncryptionView"];
export type BucketEncryptionPutRequest =
  components["schemas"]["BucketEncryptionPutRequest"];
export type BucketLifecycleView = components["schemas"]["BucketLifecycleView"];
export type BucketLifecyclePutRequest =
  components["schemas"]["BucketLifecyclePutRequest"];
export type BucketObjectOwnershipMode =
  components["schemas"]["BucketObjectOwnershipMode"];
export type BucketVersioningStatus =
  components["schemas"]["BucketVersioningStatus"];
export type BucketEncryptionMode =
  components["schemas"]["BucketEncryptionMode"];
export type BucketBlockPublicAccess =
  components["schemas"]["BucketBlockPublicAccess"];

export type BucketPolicyResponse =
  components["schemas"]["BucketPolicyResponse"];
export type BucketPolicyPutRequest =
  components["schemas"]["BucketPolicyPutRequest"];
export type BucketPolicyValidateResponse =
  components["schemas"]["BucketPolicyValidateResponse"];

export type ObjectItem = components["schemas"]["ObjectItem"];
export type ListObjectsResponse = components["schemas"]["ListObjectsResponse"];
export type SearchObjectsResponse =
  components["schemas"]["SearchObjectsResponse"];
export type ObjectIndexSummaryResponse =
  components["schemas"]["ObjectIndexSummaryResponse"];
export type ObjectMeta = components["schemas"]["ObjectMeta"];
export type PresignedURLResponse =
  components["schemas"]["PresignedURLResponse"];
export type CreateFolderRequest = components["schemas"]["CreateFolderRequest"];
export type CreateFolderResponse =
  components["schemas"]["CreateFolderResponse"];

export type ObjectFavorite = components["schemas"]["ObjectFavorite"];
export type ObjectFavoriteCreateRequest =
  components["schemas"]["ObjectFavoriteCreateRequest"];
export type FavoriteObjectItem = components["schemas"]["FavoriteObjectItem"];
export type ObjectFavoritesResponse =
  components["schemas"]["ObjectFavoritesResponse"];

export type DeleteObjectsRequest =
  components["schemas"]["DeleteObjectsRequest"];
export type DeleteObjectsResponse =
  components["schemas"]["DeleteObjectsResponse"];

export type UploadCreateRequest = components["schemas"]["UploadCreateRequest"];
export type UploadCreateResponse =
  components["schemas"]["UploadCreateResponse"];
export type UploadPresignRequest =
  components["schemas"]["UploadPresignRequest"];
export type UploadPresignResponse =
  components["schemas"]["UploadPresignResponse"];
export type UploadChunkState = components["schemas"]["UploadChunkState"];
export type UploadMultipartCompleteRequest =
  components["schemas"]["UploadMultipartCompleteRequest"];
export type UploadMultipartAbortRequest =
  components["schemas"]["UploadMultipartAbortRequest"];

export type JobStatus = components["schemas"]["JobStatus"];
export type JobProgress = components["schemas"]["JobProgress"];
export type Job = components["schemas"]["Job"];
export type JobCreateRequest = components["schemas"]["JobCreateRequest"];
export type JobCreatedResponse = components["schemas"]["JobCreatedResponse"];
export type JobsListResponse = components["schemas"]["JobsListResponse"];
export type MetaResponse = components["schemas"]["MetaResponse"];
export type ServerMigrationManifest =
  components["schemas"]["ServerMigrationManifest"];
export type ServerRestoreResponse =
  components["schemas"]["ServerRestoreResponse"];
export type ServerStagedRestore =
  components["schemas"]["ServerStagedRestore"];
export type ServerStagedRestoreListResponse =
  components["schemas"]["ServerStagedRestoreListResponse"];
export type ServerMigrationEntityManifest =
  components["schemas"]["ServerMigrationEntityManifest"];
export type ServerMigrationAssetManifest =
  components["schemas"]["ServerMigrationAssetManifest"];
export type ServerPortableImportPreflight =
  components["schemas"]["ServerPortableImportPreflight"];
export type ServerPortableImportEntityResult =
  components["schemas"]["ServerPortableImportEntityResult"];
export type ServerPortableImportVerification =
  components["schemas"]["ServerPortableImportVerification"];
export type ServerPortableImportResponse =
  components["schemas"]["ServerPortableImportResponse"];

export type LocalEntry = components["schemas"]["LocalEntry"];
export type ListLocalEntriesResponse =
  components["schemas"]["ListLocalEntriesResponse"];

export type WSEvent = components["schemas"]["WSEvent"];
