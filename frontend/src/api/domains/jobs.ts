import type { RequestOptions } from '../retryTransport'
import type { Job, JobCreateRequest, JobsListResponse } from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>
type FetchResponseFn = (path: string, init: RequestInit, options?: RequestOptions) => Promise<Response>

export function listJobs(
	request: RequestFn,
	profileId: string,
	args: { status?: string; type?: string; errorCode?: string; limit?: number; cursor?: string } = {},
): Promise<JobsListResponse> {
	const params = new URLSearchParams()
	if (args.status) params.set('status', args.status)
	if (args.type) params.set('type', args.type)
	if (args.errorCode) params.set('errorCode', args.errorCode)
	if (args.limit) params.set('limit', String(args.limit))
	if (args.cursor) params.set('cursor', args.cursor)
	const qs = params.toString()
	return request(`/jobs${qs ? `?${qs}` : ''}`, { method: 'GET' }, { profileId })
}

export function createJob(request: RequestFn, profileId: string, req: JobCreateRequest): Promise<Job> {
	return request('/jobs', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(req),
	}, { profileId })
}

export function getJob(request: RequestFn, profileId: string, jobId: string): Promise<Job> {
	return request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, { profileId })
}

export function deleteJob(request: RequestFn, profileId: string, jobId: string): Promise<void> {
	return request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }, { profileId })
}

export function getJobLogs(request: RequestFn, profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<string> {
	const params = new URLSearchParams()
	params.set('tailBytes', String(tailBytes))
	return request(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
}

export async function getJobLogsTail(fetchResponse: FetchResponseFn, profileId: string, jobId: string, tailBytes = 64 * 1024): Promise<{ text: string; nextOffset: number }> {
	const params = new URLSearchParams()
	params.set('tailBytes', String(tailBytes))
	const res = await fetchResponse(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
	const text = res.status === 204 ? '' : await res.text()
	const rawOffset = res.headers.get('X-Log-Next-Offset') ?? res.headers.get('x-log-next-offset') ?? '0'
	const nextOffset = Number.parseInt(rawOffset, 10)
	return { text, nextOffset: Number.isFinite(nextOffset) ? nextOffset : 0 }
}

export async function getJobLogsAfterOffset(
	fetchResponse: FetchResponseFn,
	profileId: string,
	jobId: string,
	afterOffset: number,
	maxBytes = 64 * 1024,
): Promise<{ text: string; nextOffset: number }> {
	const params = new URLSearchParams()
	params.set('afterOffset', String(afterOffset))
	params.set('maxBytes', String(maxBytes))
	const res = await fetchResponse(`/jobs/${encodeURIComponent(jobId)}/logs?${params.toString()}`, { method: 'GET' }, { profileId })
	const text = res.status === 204 ? '' : await res.text()
	const rawOffset = res.headers.get('X-Log-Next-Offset') ?? res.headers.get('x-log-next-offset') ?? '0'
	const nextOffset = Number.parseInt(rawOffset, 10)
	return { text, nextOffset: Number.isFinite(nextOffset) ? nextOffset : afterOffset }
}

export function cancelJob(request: RequestFn, profileId: string, jobId: string): Promise<Job> {
	return request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }, { profileId })
}

export function retryJob(request: RequestFn, profileId: string, jobId: string): Promise<Job> {
	return request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }, { profileId })
}
