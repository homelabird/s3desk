import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ObjectsCopyMoveModal } from '../ObjectsCopyMoveModal'
import { ObjectsCopyPrefixModal } from '../ObjectsCopyPrefixModal'
import { ObjectsMoveSelectionSheet } from '../ObjectsMoveSelectionSheet'
import { ObjectsRenameModal } from '../ObjectsRenameModal'
import { normalizePrefix } from '../objectsListUtils'

vi.mock('../../../components/DialogModal', () => ({
	DialogModal: (props: { open: boolean; children: ReactNode; footer: ReactNode }) =>
		props.open ? <div>{props.children}{props.footer}</div> : null,
}))

vi.mock('../ObjectsOverlaySheet', () => ({
	ObjectsOverlaySheet: (props: { open: boolean; children: ReactNode }) =>
		props.open ? <div>{props.children}</div> : null,
}))

describe('Objects destructive action forms', () => {
	beforeEach(() => {
		vi.stubGlobal('ResizeObserver', class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		})
	})

	afterEach(() => vi.unstubAllGlobals())

	it.each(['copy', 'move'] as const)('matches object %s button and Enter submission to normalized destination rules', (mode) => {
		const props: ComponentProps<typeof ObjectsCopyMoveModal> = {
			open: true,
			mode,
			bucket: 'source-bucket',
			srcKey: 'alpha.txt',
			values: { dstBucket: 'source-bucket', dstKey: 'archive/alpha.txt', dryRun: false, confirm: 'MOVE' },
			onValuesChange: vi.fn(),
			bucketOptions: [{ label: 'source-bucket', value: 'source-bucket' }],
			isBucketsLoading: false,
			isSubmitting: false,
			onCancel: vi.fn(),
			onFinish: vi.fn(),
		}
		const { rerender } = render(<ObjectsCopyMoveModal {...props} />)
		const button = screen.getByRole('button', { name: mode === 'copy' ? 'Start copy' : 'Start move' })
		const form = screen.getByRole('textbox', { name: 'Destination key' }).closest('form')!
		const invalid = [
			{ ...props.values, dstBucket: ' ' },
			{ ...props.values, dstKey: ' /// ' },
			{ ...props.values, dstKey: 'archive/*.txt' },
			{ ...props.values, dstBucket: ' source-bucket ', dstKey: ' /alpha.txt ' },
			...(mode === 'move' ? ['', 'move', 'MOVE '].map((confirm) => ({ ...props.values, confirm })) : []),
		]
		for (const values of invalid) {
			rerender(<ObjectsCopyMoveModal {...props} values={values} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).not.toHaveBeenCalled()

		const values = { ...props.values, dstBucket: ' source-bucket ', dstKey: ' /archive/alpha.txt ' }
		rerender(<ObjectsCopyMoveModal {...props} values={values} />)
		expect(button).toBeEnabled()
		fireEvent.submit(form)
		expect(props.onFinish).toHaveBeenCalledExactlyOnceWith(values)
		fireEvent.click(button)
		expect(props.onFinish).toHaveBeenCalledTimes(2)

		const dryRun = { ...values, dryRun: true, confirm: '' }
		rerender(<ObjectsCopyMoveModal {...props} values={dryRun} />)
		expect(button).toBeEnabled()
		rerender(<ObjectsCopyMoveModal {...props} values={{ ...dryRun, dstKey: 'alpha.txt' }} />)
		expect(button).toBeDisabled()
		fireEvent.submit(form)
		rerender(<ObjectsCopyMoveModal {...props} values={{ ...props.values, dstBucket: ' destination-bucket ', dstKey: 'alpha.txt' }} />)
		expect(button).toBeEnabled()
		for (const override of [{ srcKey: null }, { bucket: '' }, { isSubmitting: true }]) {
			rerender(<ObjectsCopyMoveModal {...props} {...override} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).toHaveBeenCalledTimes(2)
	})

	it.each(['copy', 'move'] as const)('matches folder %s button and Enter submission to source and confirmation rules', (mode) => {
		const props: ComponentProps<typeof ObjectsCopyPrefixModal> = {
			open: true,
			mode,
			bucket: 'source-bucket',
			srcPrefix: 'reports/',
			sourceLabel: 's3://source-bucket/reports/*',
			values: { dstBucket: 'source-bucket', dstPrefix: 'archive/', include: '', exclude: '', dryRun: false, confirm: 'MOVE' },
			onValuesChange: vi.fn(),
			bucketOptions: [{ label: 'source-bucket', value: 'source-bucket' }],
			isBucketsLoading: false,
			isSubmitting: false,
			onCancel: vi.fn(),
			onFinish: vi.fn(),
			isSummaryFetching: false,
			summary: null,
			summaryNotIndexed: false,
			isSummaryError: false,
			summaryErrorMessage: '',
			onIndexPrefix: vi.fn(),
			normalizePrefix,
		}
		const { rerender } = render(<ObjectsCopyPrefixModal {...props} />)
		const button = screen.getByRole('button', { name: mode === 'copy' ? 'Start copy' : 'Start move' })
		const form = screen.getByRole('textbox', { name: 'Destination folder' }).closest('form')!
		const invalid = [
			{ ...props.values, dstBucket: ' ' },
			{ ...props.values, dstPrefix: ' ' },
			{ ...props.values, dstPrefix: 'archive/*' },
			{ ...props.values, dstBucket: ' source-bucket ', dstPrefix: ' reports ' },
			{ ...props.values, dstPrefix: 'reports/nested/' },
			...(mode === 'move' ? ['', 'move', 'MOVE '].map((confirm) => ({ ...props.values, confirm })) : []),
		]
		for (const values of invalid) {
			rerender(<ObjectsCopyPrefixModal {...props} values={values} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).not.toHaveBeenCalled()

		const values = { ...props.values, dstBucket: ' source-bucket ', dstPrefix: ' archive ' }
		rerender(<ObjectsCopyPrefixModal {...props} values={values} />)
		expect(button).toBeEnabled()
		fireEvent.submit(form)
		expect(props.onFinish).toHaveBeenCalledExactlyOnceWith(values)
		fireEvent.click(button)
		expect(props.onFinish).toHaveBeenCalledTimes(2)

		const dryRun = { ...values, dryRun: true, confirm: '' }
		rerender(<ObjectsCopyPrefixModal {...props} values={dryRun} />)
		expect(button).toBeEnabled()
		rerender(<ObjectsCopyPrefixModal {...props} values={{ ...dryRun, dstPrefix: 'reports/nested/' }} />)
		expect(button).toBeDisabled()
		fireEvent.submit(form)
		rerender(<ObjectsCopyPrefixModal {...props} values={{ ...props.values, dstBucket: ' destination-bucket ', dstPrefix: 'reports/nested/' }} />)
		expect(button).toBeEnabled()
		// Folder normalization adds a trailing slash but retains a leading slash.
		rerender(<ObjectsCopyPrefixModal {...props} values={{ ...props.values, dstPrefix: ' /reports ' }} />)
		expect(button).toBeEnabled()
		for (const override of [{ srcPrefix: '' }, { bucket: '' }, { isSubmitting: true }]) {
			rerender(<ObjectsCopyPrefixModal {...props} {...override} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).toHaveBeenCalledTimes(2)
	})

	it('requires exact rename confirmation for both the button and Enter submission', () => {
		const props: ComponentProps<typeof ObjectsRenameModal> = {
			open: true,
			kind: 'object',
			source: 'reports/original.txt',
			bucket: 'source-bucket',
			values: { name: 'renamed.txt', confirm: '' },
			onValuesChange: vi.fn(),
			isSubmitting: false,
			onCancel: vi.fn(),
			onFinish: vi.fn(),
		}
		const { rerender } = render(<ObjectsRenameModal {...props} />)
		const button = screen.getByRole('button', { name: 'Rename' })
		const form = screen.getByRole('textbox', { name: 'New name' }).closest('form')!

		for (const confirm of ['', 'rename', 'RENAME ']) {
			rerender(<ObjectsRenameModal {...props} values={{ ...props.values, confirm }} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).not.toHaveBeenCalled()

		const values = { name: 'renamed.txt', confirm: 'RENAME' }
		rerender(<ObjectsRenameModal {...props} values={values} />)
		expect(button).toBeEnabled()
		fireEvent.submit(form)
		expect(props.onFinish).toHaveBeenCalledExactlyOnceWith(values)
		fireEvent.click(button)
		expect(props.onFinish).toHaveBeenCalledTimes(2)

		for (const override of [{ values: { name: ' ', confirm: 'RENAME' } }, { source: null }, { isSubmitting: true }]) {
			rerender(<ObjectsRenameModal {...props} values={values} {...override} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).toHaveBeenCalledTimes(2)
	})

	it.each([false, true])('requires a destination and exact move confirmation in the bottom sheet: %s', (useBottomSheet) => {
		const props: ComponentProps<typeof ObjectsMoveSelectionSheet> = {
			open: true,
			useBottomSheet,
			selectedCount: 2,
			bucket: 'source-bucket',
			prefix: 'reports/',
			values: { dstBucket: 'destination-bucket', dstPrefix: '', confirm: '' },
			onValuesChange: vi.fn(),
			bucketOptions: [{ label: 'destination-bucket', value: 'destination-bucket' }],
			isBucketsLoading: false,
			isSubmitting: false,
			onCancel: vi.fn(),
			onFinish: vi.fn(),
		}
		const { rerender } = render(<ObjectsMoveSelectionSheet {...props} />)
		const button = screen.getByRole('button', { name: 'Start move' })
		const form = screen.getByRole('textbox', { name: 'Destination folder' }).closest('form')!

		for (const confirm of ['', 'move', 'MOVE ']) {
			rerender(<ObjectsMoveSelectionSheet {...props} values={{ ...props.values, confirm }} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).not.toHaveBeenCalled()

		const values = { dstBucket: ' destination-bucket ', dstPrefix: '', confirm: 'MOVE' }
		rerender(<ObjectsMoveSelectionSheet {...props} values={values} />)
		expect(button).toBeEnabled()
		fireEvent.submit(form)
		expect(props.onFinish).toHaveBeenCalledExactlyOnceWith(values)
		fireEvent.click(button)
		expect(props.onFinish).toHaveBeenCalledTimes(2)

		for (const override of [{ values: { ...values, dstBucket: ' ' } }, { selectedCount: 0 }, { bucket: '' }, { isSubmitting: true }]) {
			rerender(<ObjectsMoveSelectionSheet {...props} values={values} {...override} />)
			expect(button).toBeDisabled()
			fireEvent.submit(form)
		}
		expect(props.onFinish).toHaveBeenCalledTimes(2)
	})
})
