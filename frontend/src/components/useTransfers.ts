import { createContext, useContext } from 'react'

import type { TransfersContextValue } from './transfers/transfersTypes'

export const TransfersContext = createContext<TransfersContextValue | null>(null)

export function useTransfers(): TransfersContextValue {
	const ctx = useContext(TransfersContext)
	if (!ctx) throw new Error('useTransfers must be used within TransfersProvider')
	return ctx
}
