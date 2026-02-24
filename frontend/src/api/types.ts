import type { components } from './openapi'

export type ErrorResponse = components['schemas']['ErrorResponse']

export type Profile = components['schemas']['Profile']
export type ProfileCreateRequest = components['schemas']['ProfileCreateRequest']
export type ProfileUpdateRequest = components['schemas']['ProfileUpdateRequest']
export type ProfileTestResponse = components['schemas']['ProfileTestResponse']
export type ProfileBenchmarkResponse = components['schemas']['ProfileBenchmarkResponse']

export type ProfileTLSMode = 'disabled' | 'mtls'
export type ProfileTLSConfig = {
	mode: ProfileTLSMode
	clientCertPem?: string
	clientKeyPem?: string
	caCertPem?: string
}
export type ProfileTLSStatus = {
	mode: ProfileTLSMode
	hasClientCert: boolean
	hasClientKey: boolean
	hasCa: boolean
	updatedAt?: string
}

export type Bucket = components['schemas']['Bucket']
export type BucketCreateRequest = components['schemas']['BucketCreateRequest']

export type BucketPolicyResponse = components['schemas']['BucketPolicyResponse']
export type BucketPolicyPutRequest = components['schemas']['BucketPolicyPutRequest']
export type BucketPolicyValidateResponse = components['schemas']['BucketPolicyValidateResponse']

export type ObjectItem = components['schemas']['ObjectItem']
export type ListObjectsResponse = components['schemas']['ListObjectsResponse']
export type SearchObjectsResponse = components['schemas']['SearchObjectsResponse']
export type ObjectIndexSummaryResponse = components['schemas']['ObjectIndexSummaryResponse']
export type ObjectMeta = components['schemas']['ObjectMeta']
export type PresignedURLResponse = components['schemas']['PresignedURLResponse']
export type CreateFolderRequest = components['schemas']['CreateFolderRequest']
export type CreateFolderResponse = components['schemas']['CreateFolderResponse']

export type ObjectFavorite = {
	key: string
	createdAt: string
}
export type ObjectFavoriteCreateRequest = {
	key: string
}
export type FavoriteObjectItem = ObjectItem & {
	createdAt: string
}
export type ObjectFavoritesResponse = {
	bucket: string
	prefix?: string
	items: FavoriteObjectItem[]
}

export type DeleteObjectsRequest = components['schemas']['DeleteObjectsRequest']
export type DeleteObjectsResponse = components['schemas']['DeleteObjectsResponse']

export type UploadCreateRequest = components['schemas']['UploadCreateRequest']
export type UploadCreateResponse = components['schemas']['UploadCreateResponse']
export type UploadPresignRequest = components['schemas']['UploadPresignRequest']
export type UploadPresignResponse = components['schemas']['UploadPresignResponse']
export type UploadMultipartCompleteRequest = components['schemas']['UploadMultipartCompleteRequest']
export type UploadMultipartAbortRequest = components['schemas']['UploadMultipartAbortRequest']

export type JobStatus = components['schemas']['JobStatus']
export type JobProgress = components['schemas']['JobProgress']
export type Job = components['schemas']['Job']
export type JobCreateRequest = components['schemas']['JobCreateRequest']
export type JobCreatedResponse = components['schemas']['JobCreatedResponse']
export type JobsListResponse = components['schemas']['JobsListResponse']
export type MetaResponse = components['schemas']['MetaResponse']

export type LocalEntry = components['schemas']['LocalEntry']
export type ListLocalEntriesResponse = components['schemas']['ListLocalEntriesResponse']

export type WSEvent = {
	type: string
	ts: string
	seq: number
	jobId?: string
	payload?: unknown
}
