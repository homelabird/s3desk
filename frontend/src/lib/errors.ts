import { APIError, RequestTimeoutError } from '../api/client'

export type ErrorDetails = {
	title: string
	hint?: string
}

function formatAPIErrorTags(err: APIError): string {
	const tags: string[] = []
	if (err.normalizedError?.code) tags.push(`normalized=${err.normalizedError.code}`)
	if (typeof err.retryAfterSeconds === 'number') tags.push(`retry-after=${err.retryAfterSeconds}s`)
	return tags.length > 0 ? ` [${tags.join(', ')}]` : ''
}

export function formatError(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}${formatAPIErrorTags(err)}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}

export function getRecoveryHint(err: unknown): string | undefined {
	// API auth / access control
	if (err instanceof APIError) {
		const norm = err.normalizedError
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
			if (norm?.code === 'access_denied') {
				return 'Access denied. Check IAM permissions, bucket policies, and whether the credentials match the target.'
			}
			// This is often the remote-access guard or an origin/host restriction.
			return 'Forbidden. This server may be running in local-only mode or blocking your Host/Origin. If you are on the server host, open the UI from the same machine (loopback). For remote access, set ALLOW_REMOTE=true, configure API_TOKEN, and (if using a hostname) add it to ALLOWED_HOSTS.'
		}
		if (err.status === 400 && err.code === 'invalid_request') {
			const msg = err.message.toLowerCase()
			if (msg.includes('allowed local directory')) {
				return 'Local path is outside the server allowlist. Choose a path under ALLOWED_LOCAL_DIRS (see Settings > Server).'
			}
			if (msg.includes('payload.localpath not found')) {
				return 'Local path was not found on the server filesystem. Verify the path exists on the server host.'
			}
		}

		// Provider-agnostic normalized errors (derived from rclone stderr)
		if (norm?.code === 'invalid_credentials') {
			return 'Invalid credentials. Double-check access keys / account key / service account JSON.'
		}
		if (norm?.code === 'access_denied') {
			return 'Access denied. Check IAM permissions, bucket policies, and whether the credentials match the target.'
		}
		if (norm?.code === 'not_found') {
			return 'Not found. The bucket/object may not exist, or the credentials cannot see it.'
		}
		if (norm?.code === 'rate_limited') {
			if (typeof err.retryAfterSeconds === 'number') {
				return 'Wait for the Retry-After interval, then retry.'
			}
			return 'Rate limited by provider. Retry after a short delay.'
		}
		if (norm?.code === 'signature_mismatch') {
			return 'Signature mismatch. Common causes: wrong secret key, wrong region, clock skew, or path-style setting.'
		}
		if (norm?.code === 'request_time_skewed') {
			return 'Request time skewed. Check server/system time (NTP) and try again.'
		}
		if (norm?.code === 'invalid_config') {
			return 'Invalid configuration. Re-check endpoint/region and provider-specific fields.'
		}
		if (norm?.code === 'endpoint_unreachable') {
			return 'Endpoint unreachable. Verify the endpoint URL, DNS, and network access from the server.'
		}
		if (norm?.code === 'upstream_timeout') {
			return 'Upstream timeout. Provider or network is slow; retry later.'
		}
		if (norm?.code === 'network_error') {
			return 'Network error. Check connectivity, proxy/firewall rules, and TLS settings.'
		}
		if (norm?.code === 'conflict') {
			return 'Conflict. The resource may already exist, or a precondition failed.'
		}
		if (norm?.code === 'canceled') {
			return 'Request was canceled.'
		}
		if (norm?.retryable) {
			return 'Temporary provider error. Retry after a short delay.'
		}
		if (err.status >= 500) {
			return 'Server-side error. Retry shortly; if it persists, inspect server logs.'
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
	return details.hint ? `${details.title} · Recommended action: ${details.hint}` : details.title
}
