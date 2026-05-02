import { useState } from 'react'

type UseObjectsAutoScanReadinessArgs = {
	apiToken: string
	profileId: string | null
	bucket: string
	prefix: string
}

export function useObjectsAutoScanReadiness({
	apiToken,
	profileId,
	bucket,
	prefix,
}: UseObjectsAutoScanReadinessArgs) {
	const [autoScanReadyKey, setAutoScanReadyKey] = useState('')
	const autoScanServerScope = apiToken || '__no_server__'
	const autoScanProfileScope = profileId?.trim() || '__no_profile__'
	const autoScanKey = bucket ? `${autoScanServerScope}:${autoScanProfileScope}:${bucket}|${prefix}` : ''
	const autoScanReady = !!bucket && autoScanReadyKey === autoScanKey

	return {
		autoScanReady,
		setAutoScanReadyKey,
	}
}
