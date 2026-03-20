import { DEFAULT_TIMEOUT_MS } from '../config'
import type { RequestOptions } from '../retryTransport'
import type {
	Profile,
	ProfileBenchmarkResponse,
	ProfileCreateRequest,
	ProfileTestResponse,
	ProfileTLSConfig,
	ProfileTLSStatus,
	ProfileUpdateRequest,
} from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>

export function listProfiles(request: RequestFn): Promise<Profile[]> {
	return request('/profiles', { method: 'GET' })
}

export function createProfile(request: RequestFn, req: ProfileCreateRequest): Promise<Profile> {
	return request('/profiles', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	})
}

export function updateProfile(request: RequestFn, profileId: string, req: ProfileUpdateRequest): Promise<Profile> {
	return request(`/profiles/${encodeURIComponent(profileId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	})
}

export function deleteProfile(request: RequestFn, profileId: string): Promise<void> {
	return request(`/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })
}

export function testProfile(request: RequestFn, profileId: string): Promise<ProfileTestResponse> {
	return request(`/profiles/${encodeURIComponent(profileId)}/test`, { method: 'POST' }, { timeoutMs: DEFAULT_TIMEOUT_MS })
}

export function benchmarkProfile(request: RequestFn, profileId: string): Promise<ProfileBenchmarkResponse> {
	return request(`/profiles/${encodeURIComponent(profileId)}/benchmark`, { method: 'POST' }, { timeoutMs: 120_000 })
}

export function getProfileTLS(request: RequestFn, profileId: string): Promise<ProfileTLSStatus> {
	return request(`/profiles/${encodeURIComponent(profileId)}/tls`, { method: 'GET' })
}

export function updateProfileTLS(request: RequestFn, profileId: string, req: ProfileTLSConfig): Promise<ProfileTLSStatus> {
	return request(`/profiles/${encodeURIComponent(profileId)}/tls`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	})
}

export function deleteProfileTLS(request: RequestFn, profileId: string): Promise<void> {
	return request(`/profiles/${encodeURIComponent(profileId)}/tls`, { method: 'DELETE' })
}

export function exportProfileYaml(request: RequestFn, profileId: string, args: { download?: boolean } = {}): Promise<string> {
	const params = new URLSearchParams()
	if (args.download) params.set('download', 'true')
	const suffix = params.toString()
	return request(`/profiles/${encodeURIComponent(profileId)}/export${suffix ? `?${suffix}` : ''}`, { method: 'GET' })
}
