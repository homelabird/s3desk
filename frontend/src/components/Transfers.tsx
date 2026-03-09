import { DownloadOutlined } from '@ant-design/icons'
import { Badge, Button, type ButtonProps } from 'antd'
import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect } from 'react'

import { TransfersContext, useTransfers } from './useTransfers'
import { useTransfersRuntimeController } from './transfers/useTransfersRuntimeController'
import { useTransfersRuntimeNotifications } from './transfers/useTransfersRuntimeNotifications'
import type {
	TransfersContextValue,
	TransfersRuntimeApi,
	TransfersRuntimeSnapshot,
	UploadCapabilityByProfileId,
} from './transfers/transfersTypes'

export type { TransfersContextValue } from './transfers/transfersTypes'

const TransfersRuntimeUiHost = lazy(async () => {
	const m = await import('./transfers/TransfersRuntimeUiHost')
	return { default: m.TransfersRuntimeUiHost }
})

type TransfersProviderProps = {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	children: ReactNode
}

export type TransfersRuntimeBridgeProps = {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	onSnapshotChange: (snapshot: TransfersRuntimeSnapshot) => void
	onApiChange: (api: TransfersRuntimeApi | null) => void
}

export function TransfersProvider(props: TransfersProviderProps) {
	const notifications = useTransfersRuntimeNotifications()
	const controller = useTransfersRuntimeController({
		apiToken: props.apiToken,
		uploadDirectStream: props.uploadDirectStream,
		uploadCapabilityByProfileId: props.uploadCapabilityByProfileId,
		notifications,
	})

	return (
		<TransfersContext.Provider value={controller.ctx}>
			{props.children}
			{controller.uiState.isOpen ? (
				<Suspense fallback={null}>
					<TransfersRuntimeUiHost uiState={controller.uiState} uiActions={controller.uiActions} />
				</Suspense>
			) : null}
		</TransfersContext.Provider>
	)
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

export function TransfersButton(props: { showLabel?: boolean; ariaLabel?: string; type?: ButtonProps['type']; className?: string } = {}) {
	const transfers = useTransfers()
	return (
		<Button
			type={props.type}
			className={props.className}
			aria-label={props.ariaLabel ?? 'Transfers'}
			icon={
				<Badge count={transfers.activeTransferCount} size="small" showZero={false}>
					<DownloadOutlined />
				</Badge>
			}
			onClick={() => transfers.openTransfers()}
		>
			{props.showLabel ? 'Transfers' : null}
		</Button>
	)
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
