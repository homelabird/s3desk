import { APIError, RequestTimeoutError } from '../api/client'

export type ErrorDetails = {
	title: string
	hint?: string
}

export function formatError(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

export function getRecoveryHint(err: unknown): string | undefined {
	// API auth / access control
	if (err instanceof APIError) {
		if (err.code === 'transfer_engine_missing') {
			return 'Transfer engine (rclone) not found. Install rclone or set RCLONE_PATH on the server.'
		}
		if (err.code === 'transfer_engine_incompatible') {
			const cur = typeof err.details?.currentVersion === 'string' ? err.details.currentVersion : ''
			const min = typeof err.details?.minVersion === 'string' ? err.details.minVersion : ''
			const verInfo = cur || min ? ` (current: ${cur || '?'} · requires: >= ${min || '?'})` : ''
			return `Transfer engine (rclone) version is incompatible${verInfo}. Upgrade rclone on the server.`
		}
		if (err.status === 401) {
			return 'Unauthorized. Check the API Token in Settings (must match API_TOKEN on the server).'
		}
		if (err.status === 403) {
			// This is often the remote-access guard or an origin/host restriction.
			return 'Forbidden. If this is your own server, try localhost or verify ALLOW_REMOTE / ALLOWED_HOSTS / ALLOWED_ORIGINS.'
		}
	}

	// Network / infra
	if (err instanceof RequestTimeoutError) {
		return `Request timed out. The server may be slow or unreachable.`
	}
	// fetch() throws TypeError for many network failures (DNS, offline, blocked, etc.)
	if (err instanceof TypeError) {
		return 'Network error. Verify the backend is running and the URL/port is reachable.'
	}

	return undefined
}

export function describeError(err: unknown): ErrorDetails {
	const title = formatError(err)
	const hint = getRecoveryHint(err)
	return hint ? { title, hint } : { title }
}

export function formatErrorWithHint(err: unknown): string {
	const details = describeError(err)
	return details.hint ? `${details.title} · ${details.hint}` : details.title
}
