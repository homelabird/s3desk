import { useEffect, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { needsConservativeTransfers, sanitizeTransferSafetyMode, TRANSFER_SAFETY_MODE_KEY, type TransferEnvironment, type TransferSafetyMode } from './transferSafetyPolicy'

type NetworkInformation = EventTarget & { saveData?: boolean; effectiveType?: string }
type TransferNavigator = Navigator & { connection?: NetworkInformation; deviceMemory?: number }

export function readTransferEnvironment(): TransferEnvironment {
	const nav = typeof navigator !== 'undefined' ? navigator as TransferNavigator : undefined
	return {
		coarsePointer: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
		saveData: nav?.connection?.saveData === true,
		effectiveType: nav?.connection?.effectiveType,
		deviceMemory: nav?.deviceMemory,
	}
}

export function useTransferSafety() {
	const [mode, setMode] = useLocalStorageState<TransferSafetyMode>(TRANSFER_SAFETY_MODE_KEY, 'auto', { sanitize: sanitizeTransferSafetyMode })
	const [environment, setEnvironment] = useState(readTransferEnvironment)
	useEffect(() => {
		const update = () => setEnvironment(readTransferEnvironment())
		const media = window.matchMedia?.('(pointer: coarse)')
		const connection = (navigator as TransferNavigator).connection
		media?.addEventListener?.('change', update)
		connection?.addEventListener?.('change', update)
		window.addEventListener('pageshow', update)
		return () => {
			media?.removeEventListener?.('change', update)
			connection?.removeEventListener?.('change', update)
			window.removeEventListener('pageshow', update)
		}
	}, [])
	return { mode, setMode, environment, conservative: needsConservativeTransfers(mode, environment) }
}
