import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { memo, useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TransfersButton, TransfersProvider } from '../TransfersShell'
import {
	TransfersContexts,
	useTransfers,
	useTransfersCommands,
} from '../useTransfers'
import { transfersStub } from '../../test/transfersStub'

const runtimeApi = vi.hoisted(() => ({
	openTransfers: vi.fn(),
	closeTransfers: vi.fn(),
	queueDownloadObject: vi.fn(),
	queueDownloadObjectsToDevice: vi.fn(),
	queueDownloadJobArtifact: vi.fn(),
	queueUploadFiles: vi.fn(),
}))

vi.mock('../Transfers', async () => {
	const React = await import('react')
	return {
		TransfersRuntimeBridge: ({
			onSnapshotChange,
			onApiChange,
		}: {
			onSnapshotChange: (snapshot: {
				isOpen: boolean
				tab: 'downloads' | 'uploads'
				activeDownloadCount: number
				activeUploadCount: number
				activeTransferCount: number
				downloadTasks: []
				uploadTasks: []
			}) => void
			onApiChange: (api: typeof runtimeApi | null) => void
		}) => {
			useEffect(() => {
				onSnapshotChange({
					isOpen: false,
					tab: 'downloads',
					activeDownloadCount: 2,
					activeUploadCount: 1,
					activeTransferCount: 3,
					downloadTasks: [],
					uploadTasks: [],
				})
				onApiChange(runtimeApi)
				return () => onApiChange(null)
			}, [onApiChange, onSnapshotChange])

			return React.createElement('div', { 'data-testid': 'transfers-runtime-bridge' })
		},
	}
})

function TransfersControls() {
	const transfers = useTransfers()
	return (
		<>
			<button type="button" onClick={() => transfers.openTransfers('uploads')}>
				Open uploads
			</button>
			<button
				type="button"
				onClick={() =>
					transfers.queueUploadFiles({
						profileId: 'profile-1',
						bucket: 'bucket-a',
						prefix: 'folder/',
						files: [new File(['alpha'], 'alpha.txt')],
					})
				}
			>
				Queue upload
			</button>
		</>
	)
}

const CommandConsumer = memo(function CommandConsumer(props: {
	onRender: () => void
}) {
	props.onRender()
	useTransfersCommands()
	return null
})

describe('TransfersShell', () => {
	beforeEach(() => {
		Object.values(runtimeApi).forEach((fn) => fn.mockReset())
	})

	it('eagerly mounts the runtime bridge in dev webdriver sessions', async () => {
		const original = navigator.webdriver
		Object.defineProperty(navigator, 'webdriver', {
			configurable: true,
			value: true,
		})

		try {
			render(
				<TransfersProvider apiToken="token-1">
					<TransfersButton showLabel />
				</TransfersProvider>,
			)

			expect(await screen.findByTestId('transfers-runtime-bridge')).toBeInTheDocument()
		} finally {
			Object.defineProperty(navigator, 'webdriver', {
				configurable: true,
				value: original,
			})
		}
	})

	it('does not mount the runtime bridge until a transfer action is requested', async () => {
		render(
			<TransfersProvider apiToken="token-1">
				<TransfersButton showLabel />
				<TransfersControls />
			</TransfersProvider>,
		)

		expect(screen.queryByTestId('transfers-runtime-bridge')).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Open uploads' }))

		expect(await screen.findByTestId('transfers-runtime-bridge')).toBeInTheDocument()
		await waitFor(() => expect(runtimeApi.openTransfers).toHaveBeenCalledWith('uploads'))
	})

	it('replays queued transfer commands once the runtime bridge is ready', async () => {
		render(
			<TransfersProvider apiToken="token-1">
				<TransfersControls />
			</TransfersProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Queue upload' }))

		expect(await screen.findByTestId('transfers-runtime-bridge')).toBeInTheDocument()
		await waitFor(() => expect(runtimeApi.queueUploadFiles).toHaveBeenCalledTimes(1))
		expect(runtimeApi.queueUploadFiles.mock.calls[0]?.[0]).toMatchObject({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'folder/',
		})
	})

	it('updates the transfers button badge from runtime snapshot state', async () => {
		render(
			<TransfersProvider apiToken="token-1" eager>
				<TransfersButton showLabel />
			</TransfersProvider>,
		)

		expect(await screen.findByTestId('transfers-runtime-bridge')).toBeInTheDocument()
		await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
	})

	it('does not rerender command consumers for task progress changes', () => {
		const onRender = vi.fn()
		const progressValue = {
			...transfersStub,
			downloadTasks: [
				{
					id: 'download-1',
					kind: 'object' as const,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					key: 'alpha.txt',
					label: 'alpha.txt',
					status: 'running' as const,
					createdAtMs: 1,
					loadedBytes: 50,
					totalBytes: 100,
					speedBps: 10,
					etaSeconds: 5,
				},
			],
		}
		const { rerender } = render(
			<TransfersContexts value={transfersStub}>
				<CommandConsumer onRender={onRender} />
			</TransfersContexts>,
		)

		rerender(
			<TransfersContexts value={progressValue}>
				<CommandConsumer onRender={onRender} />
			</TransfersContexts>,
		)

		expect(onRender).toHaveBeenCalledTimes(1)
	})
})
