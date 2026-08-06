import { useCallback, useMemo, type ReactNode } from 'react'

import { clearPersistedTransfersStorage } from '../components/transfers/useTransfersPersistence'
import { clearPersistentThumbnailCache } from '../lib/thumbnailCache'
import { clearResettableUiState } from '../lib/storageResetRegistry'
import { useSessionStorageState } from '../lib/useSessionStorageState'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider(props: { children: ReactNode }) {
	const [apiToken, setStoredApiToken] = useSessionStorageState('apiToken', '', { legacyLocalStorageKey: 'apiToken' })
	const setApiToken = useCallback(
		(next: string | ((prev: string) => string)) => {
			const nextToken = typeof next === 'function' ? next(apiToken) : next
			if (nextToken !== apiToken) {
				void clearPersistentThumbnailCache()
				if (apiToken) {
					clearResettableUiState()
					clearPersistedTransfersStorage()
				}
			}
			setStoredApiToken(next)
		},
		[apiToken, setStoredApiToken],
	)
	const value = useMemo<AuthContextValue>(
		() => ({
			apiToken,
			setApiToken,
			clearApiToken: () => setApiToken(''),
		}),
		[apiToken, setApiToken],
	)

	return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}
