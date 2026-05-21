import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
	selectBucketFirstSentenceHint,
	selectObjectToLoadMetadataHint,
	selectObjectToSeeDetailsHint,
	selectProfileFirstSentenceHint,
} from '../../../lib/actionHints'
import styles from '../ObjectsDetails.module.css'
import { ObjectsDetailsContent } from '../ObjectsDetailsContent'

describe('ObjectsDetailsContent', () => {
	it('shows shared prerequisite copy before a profile or bucket is selected', () => {
		const { rerender } = render(
			<ObjectsDetailsContent
				hasProfile={false}
				hasBucket
				isAdvanced={false}
				selectedCount={0}
				detailsKey={null}
				detailsMeta={null}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText(selectProfileFirstSentenceHint())).toBeInTheDocument()

		rerender(
			<ObjectsDetailsContent
				hasProfile
				hasBucket={false}
				isAdvanced={false}
				selectedCount={0}
				detailsKey={null}
				detailsMeta={null}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText(selectBucketFirstSentenceHint())).toBeInTheDocument()
	})

	it('wires compact actions and preview controls for object details', () => {
		render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced
				selectedCount={1}
				detailsKey="preview.png"
				detailsMeta={{
					key: 'preview.png',
					size: 2048,
					etag: '"preview"',
					lastModified: '2024-01-01T00:00:00Z',
					contentType: 'image/png',
					metadata: { suite: 'unit' },
				}}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				thumbnail={<img alt="thumbnail" src="thumb.png" />}
				preview={{
					key: 'preview.png',
					status: 'ready',
					kind: 'image',
					contentType: 'image/png',
					url: 'blob:preview',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('objects-details-content')).toBeInTheDocument()
		expect(screen.getByTestId('objects-details-action-row')).toBeInTheDocument()
		expect(screen.getByTestId('objects-details-preview-actions')).toBeInTheDocument()
		expect(screen.queryByText('Thumbnail')).not.toBeInTheDocument()

		for (const name of ['Copy key', 'Download (client)', 'URL', 'Copy', 'Move', 'Delete'] as const) {
			expect(screen.getByRole('button', { name }).className).toContain(styles.detailsActionButton)
		}

		expect(screen.getByTestId('objects-details-preview-open-large').className).toContain(styles.detailsSectionActionButton)
		expect(screen.getByTestId('objects-details-preview-load').className).toContain(styles.detailsSectionActionButton)
		expect(
			screen
				.getAllByText('image/png')
				.some((element) => element.classList.contains(styles.detailsCodeValueWrap) || Boolean(element.closest(`.${styles.detailsCodeValueWrap}`))),
		).toBe(true)
	})

	it('announces metadata loading status', () => {
		render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={1}
				detailsKey="preview.png"
				detailsMeta={null}
				isMetaFetching
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByRole('status', { name: 'Loading object metadata' })).toHaveTextContent('Loading metadata...')
	})

	it('announces preview loading status', () => {
		render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={1}
				detailsKey="preview.png"
				detailsMeta={{
					key: 'preview.png',
					size: 2048,
					etag: '"preview"',
					lastModified: '2024-01-01T00:00:00Z',
					contentType: 'image/png',
					metadata: {},
				}}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={{ key: 'preview.png', status: 'loading', kind: 'image', contentType: 'image/png' }}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByRole('status', { name: 'Preview loading' })).toHaveTextContent('Preview loading')
	})

	it('shows shared preview recovery copy for blocked previews', () => {
		render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={1}
				detailsKey="oversized.png"
				detailsMeta={{
					key: 'oversized.png',
					size: 2048,
					etag: '"oversized"',
					lastModified: '2024-01-01T00:00:00Z',
					contentType: 'image/png',
					metadata: {},
				}}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={{
					key: 'oversized.png',
					status: 'blocked',
					kind: 'image',
					contentType: 'image/png',
					error: 'Preview is limited to 25 MiB. This object is 40 MiB.',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText('Preview too large')).toBeInTheDocument()
		expect(screen.getByText('Use Download or URL to view the original file.')).toBeInTheDocument()
	})

	it('shows shared preview recovery copy for unsupported types', () => {
		render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={1}
				detailsKey="archive.zip"
				detailsMeta={{
					key: 'archive.zip',
					size: 2048,
					etag: '"archive"',
					lastModified: '2024-01-01T00:00:00Z',
					contentType: 'application/zip',
					metadata: {},
				}}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={{
					key: 'archive.zip',
					status: 'unsupported',
					kind: 'unsupported',
					contentType: 'application/zip',
					error: 'Preview not supported',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText('Unsupported preview type')).toBeInTheDocument()
		expect(screen.getByText('Use Download for this file type.')).toBeInTheDocument()
	})

	it('uses shared empty-state copy before any object metadata is selected', () => {
		const { rerender } = render(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={0}
				detailsKey={null}
				detailsMeta={null}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText(selectObjectToSeeDetailsHint())).toBeInTheDocument()

		rerender(
			<ObjectsDetailsContent
				hasProfile
				hasBucket
				isAdvanced={false}
				selectedCount={1}
				detailsKey={null}
				detailsMeta={null}
				isMetaFetching={false}
				isMetaError={false}
				metaErrorMessage=""
				onRetryMeta={vi.fn()}
				onCopyKey={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
				onCopyMove={vi.fn()}
				onDelete={vi.fn()}
				isDeleteLoading={false}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onOpenLargePreview={vi.fn()}
			/>,
		)

		expect(screen.getByText(selectObjectToLoadMetadataHint())).toBeInTheDocument()
	})
})
