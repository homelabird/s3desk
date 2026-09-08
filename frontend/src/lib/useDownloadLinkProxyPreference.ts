import { useLocalStorageState } from './useLocalStorageState'

// The old key persisted false even without a user choice. Start existing browsers
// on the server default too; explicit opt-outs under this key remain respected.
export const DOWNLOAD_LINK_PROXY_STORAGE_KEY = 'downloadLinkProxyEnabledV2'

const sanitizeProxyPreference = (value: boolean) => value !== false

export function useDownloadLinkProxyPreference() {
	return useLocalStorageState(DOWNLOAD_LINK_PROXY_STORAGE_KEY, true, { sanitize: sanitizeProxyPreference })
}
