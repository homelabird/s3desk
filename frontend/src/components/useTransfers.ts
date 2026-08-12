import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react'

import type {
	TransfersContextValue,
	TransfersRuntimeApi,
	TransfersSummary,
} from './transfers/transfersTypes'

export const TransfersContext = createContext<TransfersContextValue | null>(null)
const TransfersCommandsContext = createContext<TransfersRuntimeApi | null>(null)
const TransfersSummaryContext = createContext<TransfersSummary | null>(null)

export function TransfersContexts(props: {
	children: ReactNode
	value: TransfersContextValue
}) {
	const commands = useMemo<TransfersRuntimeApi>(
		() => ({
			openTransfers: props.value.openTransfers,
			closeTransfers: props.value.closeTransfers,
			queueDownloadObject: props.value.queueDownloadObject,
			queueDownloadObjectsToDevice: props.value.queueDownloadObjectsToDevice,
			queueDownloadJobArtifact: props.value.queueDownloadJobArtifact,
			queueUploadFiles: props.value.queueUploadFiles,
		}),
		[
			props.value.closeTransfers,
			props.value.openTransfers,
			props.value.queueDownloadJobArtifact,
			props.value.queueDownloadObject,
			props.value.queueDownloadObjectsToDevice,
			props.value.queueUploadFiles,
		],
	)
	const summary = useMemo<TransfersSummary>(
		() => ({
			activeDownloadCount: props.value.activeDownloadCount,
			activeUploadCount: props.value.activeUploadCount,
			activeTransferCount: props.value.activeTransferCount,
		}),
		[
			props.value.activeDownloadCount,
			props.value.activeTransferCount,
			props.value.activeUploadCount,
		],
	)

	return createElement(
		TransfersCommandsContext.Provider,
		{ value: commands },
		createElement(
			TransfersSummaryContext.Provider,
			{ value: summary },
			createElement(TransfersContext.Provider, { value: props.value }, props.children),
		),
	)
}

export function useTransfers(): TransfersContextValue {
	const ctx = useContext(TransfersContext)
	if (!ctx) throw new Error('useTransfers must be used within TransfersProvider')
	return ctx
}

export function useTransfersCommands(): TransfersRuntimeApi {
	const ctx = useContext(TransfersCommandsContext)
	if (!ctx) throw new Error('useTransfersCommands must be used within TransfersProvider')
	return ctx
}

export function useTransfersSummary(): TransfersSummary {
	const ctx = useContext(TransfersSummaryContext)
	if (!ctx) throw new Error('useTransfersSummary must be used within TransfersProvider')
	return ctx
}
