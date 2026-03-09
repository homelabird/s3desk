import { DownloadOutlined } from '@ant-design/icons'
import { Badge, Button, type ButtonProps } from 'antd'
import { type ReactNode, Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react'

import { TransfersContext, useTransfers } from './useTransfers'
import type {
	QueueDownloadJobArtifactArgs,
	QueueDownloadObjectArgs,
	QueueDownloadObjectsToDeviceArgs,
	QueueUploadFilesArgs,
	TransfersContextValue,
	TransfersRuntimeApi,
	TransfersRuntimeSnapshot,
	UploadCapabilityByProfileId,
} from './transfers/transfersTypes'

const TransfersRuntimeBridge = lazy(async () => {
	const m = await import('./Transfers')
	return { default: m.TransfersRuntimeBridge }
})

const EMPTY_TRANSFERS_SNAPSHOT: TransfersRuntimeSnapshot = {
	isOpen: false,
	tab: 'downloads',
	activeDownloadCount: 0,
	activeUploadCount: 0,
	activeTransferCount: 0,
	downloadTasks: [],
	uploadTasks: [],
}

type RuntimeCommand =
	| { type: 'open'; tab?: TransfersContextValue['tab'] }
	| { type: 'close' }
	| { type: 'queueDownloadObject'; args: QueueDownloadObjectArgs }
	| { type: 'queueDownloadObjectsToDevice'; args: QueueDownloadObjectsToDeviceArgs }
	| { type: 'queueDownloadJobArtifact'; args: QueueDownloadJobArtifactArgs }
	| { type: 'queueUploadFiles'; args: QueueUploadFilesArgs }

function runRuntimeCommand(api: TransfersRuntimeApi, command: RuntimeCommand) {
	switch (command.type) {
		case 'open':
			api.openTransfers(command.tab)
			return
		case 'close':
			api.closeTransfers()
			return
		case 'queueDownloadObject':
			api.queueDownloadObject(command.args)
			return
		case 'queueDownloadObjectsToDevice':
			api.queueDownloadObjectsToDevice(command.args)
			return
		case 'queueDownloadJobArtifact':
			api.queueDownloadJobArtifact(command.args)
			return
		case 'queueUploadFiles':
			api.queueUploadFiles(command.args)
			return
	}
}

type TransfersProviderProps = {
	apiToken: string
	uploadDirectStream?: boolean
	uploadCapabilityByProfileId?: UploadCapabilityByProfileId
	children: ReactNode
	eager?: boolean
}

export type { TransfersContextValue } from './transfers/transfersTypes'

export function TransfersProvider({
	apiToken,
	uploadDirectStream,
	uploadCapabilityByProfileId,
	children,
	eager = false,
}: TransfersProviderProps) {
	const [snapshot, setSnapshot] = useState<TransfersRuntimeSnapshot>(EMPTY_TRANSFERS_SNAPSHOT)
	const [runtimeRequested, setRuntimeRequested] = useState(false)
	const runtimeApiRef = useRef<TransfersRuntimeApi | null>(null)
	const pendingCommandsRef = useRef<RuntimeCommand[]>([])
	const shouldLoadRuntime = eager || runtimeRequested

	const flushPendingCommands = useCallback(() => {
		const api = runtimeApiRef.current
		if (!api) return
		if (pendingCommandsRef.current.length === 0) return
		for (const command of pendingCommandsRef.current) {
			runRuntimeCommand(api, command)
		}
		pendingCommandsRef.current = []
	}, [])

	const enqueueRuntimeCommand = useCallback(
		(command: RuntimeCommand) => {
			setRuntimeRequested(true)
			const api = runtimeApiRef.current
			if (api) {
				runRuntimeCommand(api, command)
				return
			}
			pendingCommandsRef.current.push(command)
		},
		[],
	)

	const handleApiChange = useCallback(
		(api: TransfersRuntimeApi | null) => {
			runtimeApiRef.current = api
			if (api) flushPendingCommands()
		},
		[flushPendingCommands],
	)

	const ctx = useMemo<TransfersContextValue>(
		() => ({
			...snapshot,
			openTransfers: (tab) => enqueueRuntimeCommand({ type: 'open', tab }),
			closeTransfers: () => enqueueRuntimeCommand({ type: 'close' }),
			queueDownloadObject: (args) => enqueueRuntimeCommand({ type: 'queueDownloadObject', args }),
			queueDownloadObjectsToDevice: (args) => enqueueRuntimeCommand({ type: 'queueDownloadObjectsToDevice', args }),
			queueDownloadJobArtifact: (args) => enqueueRuntimeCommand({ type: 'queueDownloadJobArtifact', args }),
			queueUploadFiles: (args) => enqueueRuntimeCommand({ type: 'queueUploadFiles', args }),
		}),
		[enqueueRuntimeCommand, snapshot],
	)

	return (
		<TransfersContext.Provider value={ctx}>
			{children}
			{shouldLoadRuntime ? (
				<Suspense fallback={null}>
					<TransfersRuntimeBridge
						apiToken={apiToken}
						uploadDirectStream={uploadDirectStream}
						uploadCapabilityByProfileId={uploadCapabilityByProfileId}
						onSnapshotChange={setSnapshot}
						onApiChange={handleApiChange}
					/>
				</Suspense>
			) : null}
		</TransfersContext.Provider>
	)
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
