import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../test/mockApiClient'
import { LocalPathBrowseModal } from '../LocalPathBrowseModal'

type MockTreeNode = {
	key: string
	children?: MockTreeNode[]
	isLeaf?: boolean
}

vi.mock('antd', async () => ({
	Alert: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
		<div>
			{title ? <div>{title}</div> : null}
			{description ? <div>{description}</div> : null}
		</div>
	),
	Button: ({
		children,
		onClick,
		disabled,
		icon,
	}: {
		children?: ReactNode
		onClick?: () => void
		disabled?: boolean
		icon?: ReactNode
	}) => (
		<button type="button" onClick={onClick} disabled={disabled}>
			{icon}
			{children}
		</button>
	),
	Space: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	Spin: () => <div>Loading…</div>,
	Typography: {
		Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
	},
}))

vi.mock('@ant-design/icons', () => ({
	FolderOutlined: () => <span>folder</span>,
	ReloadOutlined: () => <span>reload</span>,
}))

vi.mock('../DialogModal', () => ({
	DialogModal: ({
		open,
		title,
		footer,
		children,
		onClose,
	}: {
		open: boolean
		title: ReactNode
		footer?: ReactNode
		children: ReactNode
		onClose: () => void
	}) => (
		<div data-testid="dialog-modal" data-open={String(open)}>
			<button type="button" onClick={onClose}>
				Dialog close
			</button>
			<div>{title}</div>
			<div>{children}</div>
			<div>{footer}</div>
		</div>
	),
}))

vi.mock('../SimpleTree', () => ({
	SimpleTree: ({
		nodes,
		loadData,
		onSelectKey,
	}: {
		nodes: MockTreeNode[]
		loadData?: (key: string) => Promise<void> | void
		onSelectKey: (key: string) => void
	}) => {
		const renderNodes = (items: MockTreeNode[]): ReactNode =>
			items.map((node) => (
				<div key={node.key} data-testid={`node-${node.key}`}>
					<span>{node.key}</span>
					<button type="button" onClick={() => onSelectKey(node.key)}>
						select-{node.key}
					</button>
					{node.isLeaf ? null : loadData ? (
						<button type="button" onClick={() => void loadData(node.key)}>
							load-{node.key}
						</button>
					) : null}
					{Array.isArray(node.children) ? renderNodes(node.children) : null}
				</div>
			))

		return <div data-testid="simple-tree">{renderNodes(nodes)}</div>
	},
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('LocalPathBrowseModal', () => {
	it('ignores stale root results after the modal closes', async () => {
		const firstRequest = deferred<{ entries: Array<{ path: string; name: string }> }>()
		const listLocalEntries = vi.fn().mockImplementationOnce(() => firstRequest.promise)
		const api = createMockApiClient({
			objects: { listLocalEntries },
		})
		const onCancel = vi.fn()
		const onSelect = vi.fn()

		const { rerender } = render(
			<LocalPathBrowseModal api={api} profileId="profile-1" open={true} onCancel={onCancel} onSelect={onSelect} />,
		)

		expect(listLocalEntries).toHaveBeenCalledWith({ profileId: 'profile-1' })

		rerender(<LocalPathBrowseModal api={api} profileId="profile-1" open={false} onCancel={onCancel} onSelect={onSelect} />)

		await act(async () => {
			firstRequest.resolve({
				entries: [{ path: '/stale-root', name: 'stale-root' }],
			})
			await Promise.resolve()
		})

		expect(screen.queryByTestId('node-/stale-root')).not.toBeInTheDocument()
	})

	it('ignores stale child results after the modal closes', async () => {
		const childRequest = deferred<{ entries: Array<{ path: string; name: string }> }>()
		const listLocalEntries = vi
			.fn()
			.mockResolvedValueOnce({
				entries: [{ path: '/root', name: 'root' }],
			})
			.mockImplementationOnce(() => childRequest.promise)
		const api = createMockApiClient({
			objects: { listLocalEntries },
		})
		const onCancel = vi.fn()
		const onSelect = vi.fn()

		const { rerender } = render(
			<LocalPathBrowseModal api={api} profileId="profile-1" open={true} onCancel={onCancel} onSelect={onSelect} />,
		)

		await screen.findByTestId('node-/root')
		fireEvent.click(screen.getByRole('button', { name: 'load-/root' }))

		expect(listLocalEntries).toHaveBeenNthCalledWith(2, {
			profileId: 'profile-1',
			path: '/root',
		})

		rerender(<LocalPathBrowseModal api={api} profileId="profile-1" open={false} onCancel={onCancel} onSelect={onSelect} />)

		await act(async () => {
			childRequest.resolve({
				entries: [{ path: '/root/child', name: 'child' }],
			})
			await Promise.resolve()
		})

		expect(screen.queryByTestId('node-/root/child')).not.toBeInTheDocument()
	})

	it('ignores stale root results after the profile is cleared', async () => {
		const firstRequest = deferred<{ entries: Array<{ path: string; name: string }> }>()
		const listLocalEntries = vi.fn().mockImplementationOnce(() => firstRequest.promise)
		const api = createMockApiClient({
			objects: { listLocalEntries },
		})
		const onCancel = vi.fn()
		const onSelect = vi.fn()

		const { rerender } = render(
			<LocalPathBrowseModal api={api} profileId="profile-1" open={true} onCancel={onCancel} onSelect={onSelect} />,
		)

		rerender(<LocalPathBrowseModal api={api} profileId={null} open={true} onCancel={onCancel} onSelect={onSelect} />)

		await act(async () => {
			firstRequest.resolve({
				entries: [{ path: '/stale-after-profile-clear', name: 'stale-after-profile-clear' }],
			})
			await Promise.resolve()
		})

		expect(screen.getByText('Select a profile first')).toBeInTheDocument()
		expect(screen.queryByTestId('node-/stale-after-profile-clear')).not.toBeInTheDocument()
	})
})
