import { Suspense, lazy, useEffect } from 'react'

import { useTransfersRuntimeController } from './transfers/useTransfersRuntimeController'
import { useTransfersRuntimeNotifications } from './transfers/useTransfersRuntimeNotifications'
import type {
	TransfersContextValue,
	TransfersRuntimeApi,
	TransfersRuntimeSnapshot,
	UploadCapabilityByProfileId,
} from './transfers/transfersTypes'

const TransfersRuntimeUiHost = lazy(async () => {
	const m = await import('./transfers/TransfersRuntimeUiHost')
	return { default: m.TransfersRuntimeUiHost }
})

export type TransfersRuntimeBridgeProps = {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	onSnapshotChange: (snapshot: TransfersRuntimeSnapshot) => void
	onApiChange: (api: TransfersRuntimeApi | null) => void
}

export function TransfersRuntimeBridge(props: TransfersRuntimeBridgeProps) {
	const notifications = useTransfersRuntimeNotifications()
	const controller = useTransfersRuntimeController({
		apiToken: props.apiToken,
		uploadDirectStream: props.uploadDirectStream,
		uploadCapabilityByProfileId: props.uploadCapabilityByProfileId,
		notifications,
	})
	const { onApiChange, onSnapshotChange } = props

	useEffect(() => {
		onSnapshotChange(controller.snapshot)
	}, [controller.snapshot, onSnapshotChange])

	useEffect(() => {
		onApiChange(buildRuntimeApi(controller.ctx))
		return () => onApiChange(null)
	}, [controller.ctx, onApiChange])

	return controller.uiState.isOpen ? (
		<Suspense fallback={null}>
			<TransfersRuntimeUiHost uiState={controller.uiState} uiActions={controller.uiActions} />
		</Suspense>
	) : null
}

function buildRuntimeApi(ctx: TransfersContextValue): TransfersRuntimeApi {
	return {
		openTransfers: ctx.openTransfers,
		closeTransfers: ctx.closeTransfers,
		queueDownloadObject: ctx.queueDownloadObject,
		queueDownloadObjectsToDevice: ctx.queueDownloadObjectsToDevice,
		queueDownloadJobArtifact: ctx.queueDownloadJobArtifact,
		queueUploadFiles: ctx.queueUploadFiles,
	}
}
