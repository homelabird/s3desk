import type { RequestOptions } from '../retryTransport'
import type {
	Bucket,
	BucketAccessPutRequest,
	BucketCreateRequest,
	BucketEncryptionPutRequest,
	BucketGovernanceView,
	BucketLifecyclePutRequest,
	BucketPolicyPutRequest,
	BucketPolicyResponse,
	BucketPolicyValidateResponse,
	BucketProtectionPutRequest,
	BucketPublicExposurePutRequest,
	BucketSharingClientView,
	BucketSharingPutClientRequest,
	BucketVersioningPutRequest,
} from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>

export function listBuckets(request: RequestFn, profileId: string): Promise<Bucket[]> {
	return request('/buckets', { method: 'GET' }, { profileId })
}

export function createBucket(request: RequestFn, profileId: string, req: BucketCreateRequest): Promise<Bucket> {
	return request('/buckets', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function deleteBucket(request: RequestFn, profileId: string, bucket: string): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}`, { method: 'DELETE' }, { profileId })
}

export function getBucketGovernance(request: RequestFn, profileId: string, bucket: string): Promise<BucketGovernanceView> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance`, { method: 'GET' }, { profileId })
}

export function putBucketAccess(request: RequestFn, profileId: string, bucket: string, req: BucketAccessPutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/access`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketPublicExposure(request: RequestFn, profileId: string, bucket: string, req: BucketPublicExposurePutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/public-exposure`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketProtection(request: RequestFn, profileId: string, bucket: string, req: BucketProtectionPutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/protection`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketVersioning(request: RequestFn, profileId: string, bucket: string, req: BucketVersioningPutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/versioning`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketEncryption(request: RequestFn, profileId: string, bucket: string, req: BucketEncryptionPutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/encryption`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketLifecycle(request: RequestFn, profileId: string, bucket: string, req: BucketLifecyclePutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/lifecycle`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function putBucketSharing(request: RequestFn, profileId: string, bucket: string, req: BucketSharingPutClientRequest): Promise<BucketSharingClientView> {
	return request(`/buckets/${encodeURIComponent(bucket)}/governance/sharing`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function getBucketPolicy(request: RequestFn, profileId: string, bucket: string): Promise<BucketPolicyResponse> {
	return request(`/buckets/${encodeURIComponent(bucket)}/policy`, { method: 'GET' }, { profileId })
}

export function putBucketPolicy(request: RequestFn, profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/policy`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function deleteBucketPolicy(request: RequestFn, profileId: string, bucket: string): Promise<void> {
	return request(`/buckets/${encodeURIComponent(bucket)}/policy`, { method: 'DELETE' }, { profileId })
}

export function validateBucketPolicy(request: RequestFn, profileId: string, bucket: string, req: BucketPolicyPutRequest): Promise<BucketPolicyValidateResponse> {
	return request(`/buckets/${encodeURIComponent(bucket)}/policy/validate`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}
