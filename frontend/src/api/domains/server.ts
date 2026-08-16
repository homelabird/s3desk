import type { RequestOptions } from '../retryTransport'
import type { BootstrapResponse, MetaResponse, ServerBackupTransferRequest, ServerBackupTransferResponse, ServerPortableImportResponse, ServerRestoreResponse, ServerRestoreTransferRequest, ServerStagedRestoreListResponse } from '../types'

type RequestFn = <T>(path: string, init: RequestInit, options?: RequestOptions) => Promise<T>

function buildBundleForm(file: File, password?: string): FormData {
	const form = new FormData()
	form.append('bundle', file, file.name)
	if (typeof password === 'string' && password.length > 0) {
		form.append('password', password)
	}
	return form
}

export function getMeta(request: RequestFn): Promise<MetaResponse> {
	return request('/meta', { method: 'GET' })
}

export function getBootstrap(request: RequestFn): Promise<BootstrapResponse> {
	return request('/bootstrap', { method: 'GET' })
}

export function restoreServerBackup(request: RequestFn, file: File, password?: string): Promise<ServerRestoreResponse> {
	return request('/server/restore', { method: 'POST', body: buildBundleForm(file, password) })
}

export function transferServerBackup(request: RequestFn, body: ServerBackupTransferRequest): Promise<ServerBackupTransferResponse> {
	return request('/server/backup/transfer', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

export function transferServerRestore(request: RequestFn, body: ServerRestoreTransferRequest): Promise<ServerRestoreResponse> {
	return request('/server/restore/transfer', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

export function previewPortableImport(request: RequestFn, file: File, password?: string): Promise<ServerPortableImportResponse> {
	return request('/server/import-portable/preview', { method: 'POST', body: buildBundleForm(file, password) })
}

export function importPortableBackup(request: RequestFn, file: File, password?: string): Promise<ServerPortableImportResponse> {
	return request('/server/import-portable', { method: 'POST', body: buildBundleForm(file, password) })
}

export function listServerRestores(request: RequestFn): Promise<ServerStagedRestoreListResponse> {
	return request('/server/restores', { method: 'GET' })
}

export function deleteServerRestore(request: RequestFn, restoreId: string): Promise<void> {
	return request(`/server/restores/${encodeURIComponent(restoreId)}`, { method: 'DELETE' })
}
