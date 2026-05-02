import { createContext, useContext } from 'react'

import type { APIClientShape } from './client'

export const APIClientContext = createContext<APIClientShape | undefined>(undefined)

export function useAPIClient(): APIClientShape {
	const client = useContext(APIClientContext)
	if (!client) {
		throw new Error('useAPIClient must be used within APIClientProvider')
	}
	return client
}
