import { useMemo, type ReactNode } from 'react'

import { useSessionStorageState } from '../lib/useSessionStorageState'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider(props: { children: ReactNode }) {
	const [apiToken, setApiToken] = useSessionStorageState('apiToken', '', { legacyLocalStorageKey: 'apiToken' })
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
