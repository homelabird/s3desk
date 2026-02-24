/**
 * Maps normalized error codes from connection test results to
 * actionable troubleshooting hints for users.
 */
export function getConnectionTroubleshootingHint(normalizedCode: string): string | undefined {
	switch (normalizedCode) {
		case 'invalid_credentials':
			return 'Check that your Access Key and Secret Key (or account key / service account) are correct.'
		case 'access_denied':
			return 'The credentials are valid but lack permission. Check IAM policies or bucket permissions.'
		case 'endpoint_unreachable':
			return 'Cannot reach the endpoint. Verify the URL is correct and the server can access it.'
		case 'signature_mismatch':
			return 'Signature error — check that the region matches the actual bucket location, and the secret key is correct.'
		case 'request_time_skewed':
			return 'Server clock is out of sync. Check NTP settings on the server host.'
		case 'invalid_config':
			return 'Configuration error. Re-check the endpoint URL, region, and provider-specific fields.'
		case 'network_error':
			return 'Network error. Check connectivity, DNS, and firewall rules between the server and the storage endpoint.'
		case 'upstream_timeout':
			return 'The storage provider timed out. Retry later or check provider status.'
		case 'not_found':
			return 'Resource not found. The bucket or endpoint may not exist, or the credentials cannot see it.'
		case 'conflict':
			return 'A conflict occurred. The resource may already exist or a precondition failed.'
		case 'rate_limited':
			return 'Rate limited by the provider. Wait a moment and try again.'
		default:
			return undefined
	}
}
