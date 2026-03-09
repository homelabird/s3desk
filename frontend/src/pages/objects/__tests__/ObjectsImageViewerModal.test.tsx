import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ObjectsImageViewerModal } from '../ObjectsImageViewerModal'

const originalGetComputedStyle = window.getComputedStyle
const originalResizeObserver = globalThis.ResizeObserver

describe('ObjectsImageViewerModal', () => {
	beforeEach(() => {
		window.getComputedStyle = ((element: Element, pseudoElt?: string) =>
			originalGetComputedStyle(element, pseudoElt ? undefined : pseudoElt)) as typeof window.getComputedStyle
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as typeof ResizeObserver
	})

	afterEach(() => {
		window.getComputedStyle = originalGetComputedStyle
		globalThis.ResizeObserver = originalResizeObserver
		vi.restoreAllMocks()
	})

	it('renders extracted thumbnail previews for video objects', async () => {
		render(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="clip.mp4"
				isMetaFetching={false}
				objectMeta={{
					key: 'clip.mp4',
					contentType: 'video/mp4',
					size: 52_386_776,
				} as never}
				preview={{
					key: 'clip.mp4',
					status: 'ready',
					kind: 'video',
					contentType: 'image/jpeg',
					url: 'blob:video-thumb',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onClose={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
			/>,
		)

		expect(await screen.findByTestId('objects-image-viewer-modal')).toBeInTheDocument()
		expect(screen.getByTestId('objects-image-viewer-image')).toHaveAttribute('src', 'blob:video-thumb')
		expect(screen.getByText('video/mp4')).toBeInTheDocument()
		expect(screen.queryByText('Large preview is only available for image objects.')).not.toBeInTheDocument()
	})

	it('hides the URL action when presigned links are unsupported', async () => {
		render(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="clip.mp4"
				isMetaFetching={false}
				objectMeta={{
					key: 'clip.mp4',
					contentType: 'video/mp4',
					size: 52_386_776,
				} as never}
				preview={{
					key: 'clip.mp4',
					status: 'ready',
					kind: 'video',
					contentType: 'image/jpeg',
					url: 'blob:video-thumb',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onClose={vi.fn()}
				onDownload={vi.fn()}
				showPresignAction={false}
				onPresign={vi.fn()}
				isPresignLoading={false}
			/>,
		)

		expect(await screen.findByTestId('objects-image-viewer-modal')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'URL' })).not.toBeInTheDocument()
	})
})
