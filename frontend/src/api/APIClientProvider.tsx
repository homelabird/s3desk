import { useMemo, type ReactNode } from 'react'

import { useAuth } from '../auth/useAuth'
import { APIClient } from './client'
import { APIClientContext } from './useAPIClient'

export function APIClientProvider(props: { children: ReactNode }) {
	const { apiToken } = useAuth()
	const client = useMemo(() => new APIClient({ apiToken }), [apiToken])

	return <APIClientContext.Provider value={client}>{props.children}</APIClientContext.Provider>
}
