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

		for (const name of ['Copy key', 'Download (client)', 'URL', 'Copy', 'Move', 'Delete'] as const) {
			expect(screen.getByRole('button', { name }).className).toContain(styles.detailsActionButton)
		}

		expect(screen.getByTestId('objects-details-preview-open-large').className).toContain(styles.detailsSectionActionButton)
		expect(screen.getByTestId('objects-details-preview-load').className).toContain(styles.detailsSectionActionButton)
		expect(screen.getByTestId('objects-details-thumbnail-open-large').className).toContain(styles.detailsSectionActionButton)
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
