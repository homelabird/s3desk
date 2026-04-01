import { createContext, useContext } from 'react'

import { APIClient } from './client'

export const APIClientContext = createContext<APIClient | undefined>(undefined)

export function useAPIClient(): APIClient {
	const client = useContext(APIClientContext)
	if (!client) {
		throw new Error('useAPIClient must be used within APIClientProvider')
	}
	return client
}
