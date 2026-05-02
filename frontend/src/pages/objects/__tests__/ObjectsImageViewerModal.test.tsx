import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

	it('keeps the mobile viewer stage and actions visible', async () => {
		render(
			<ObjectsImageViewerModal
				open
				isMobile
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
		expect(screen.getByTestId('objects-image-viewer-meta')).toBeInTheDocument()
		expect(screen.getByTestId('objects-image-viewer-footer')).toBeInTheDocument()
		expect(screen.getByTestId('objects-image-viewer-stage')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
		expect(screen.getByTestId('objects-image-viewer-zoom-in')).toBeInTheDocument()
	})

	it('announces preview metadata and visual loading states', async () => {
		const { rerender } = render(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="hero.png"
				isMetaFetching
				objectMeta={null}
				preview={null}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview={false}
				onClose={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
			/>,
		)

		expect(await screen.findByRole('status', { name: 'Loading preview metadata' })).toHaveTextContent(
			'Loading preview metadata',
		)

		rerender(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="hero.png"
				isMetaFetching={false}
				objectMeta={{
					key: 'hero.png',
					contentType: 'image/png',
					size: 1_048_576,
				} as never}
				preview={{
					key: 'hero.png',
					status: 'loading',
					kind: 'image',
					contentType: 'image/png',
				}}
				onLoadPreview={vi.fn()}
				onCancelPreview={vi.fn()}
				canCancelPreview
				onClose={vi.fn()}
				onDownload={vi.fn()}
				onPresign={vi.fn()}
				isPresignLoading={false}
			/>,
		)

		expect(screen.getByRole('status', { name: 'Loading visual preview' })).toHaveTextContent('Loading full image preview')
	})

	it('updates the preview transform while dragging a zoomed image', async () => {
		render(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="hero.png"
				isMetaFetching={false}
				objectMeta={{
					key: 'hero.png',
					contentType: 'image/png',
					size: 1_048_576,
				} as never}
				preview={{
					key: 'hero.png',
					status: 'ready',
					kind: 'image',
					contentType: 'image/png',
					url: 'blob:hero',
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

		const stage = await screen.findByTestId('objects-image-viewer-stage')
		const image = screen.getByTestId('objects-image-viewer-image')
		const stageElement = stage as HTMLDivElement & {
			setPointerCapture: ReturnType<typeof vi.fn>
			releasePointerCapture: ReturnType<typeof vi.fn>
			hasPointerCapture: ReturnType<typeof vi.fn>
		}

		Object.defineProperty(stageElement, 'clientWidth', { configurable: true, value: 200 })
		Object.defineProperty(stageElement, 'clientHeight', { configurable: true, value: 200 })
		Object.defineProperty(image, 'clientWidth', { configurable: true, value: 300 })
		Object.defineProperty(image, 'clientHeight', { configurable: true, value: 300 })
		stageElement.setPointerCapture = vi.fn()
		stageElement.releasePointerCapture = vi.fn()
		stageElement.hasPointerCapture = vi.fn(() => true)

		fireEvent.click(screen.getByTestId('objects-image-viewer-zoom-in'))
		expect(image).toHaveStyle({ transform: 'translate3d(0px, 0px, 0) scale(1.5)' })

		fireEvent.pointerDown(stageElement, { pointerId: 1, clientX: 120, clientY: 120 })
		fireEvent.pointerMove(stageElement, { pointerId: 1, clientX: 120, clientY: 30 })

		expect(image).toHaveStyle({ transform: 'translate3d(0px, -90px, 0) scale(1.5)' })

		fireEvent.pointerUp(stageElement, { pointerId: 1, clientX: 120, clientY: 30 })
		expect(stageElement.setPointerCapture).toHaveBeenCalledWith(1)
		expect(stageElement.releasePointerCapture).toHaveBeenCalledWith(1)
	})

	it('pans a zoomed image with keyboard arrow keys', async () => {
		render(
			<ObjectsImageViewerModal
				open
				isMobile={false}
				objectKey="hero.png"
				isMetaFetching={false}
				objectMeta={{
					key: 'hero.png',
					contentType: 'image/png',
					size: 1_048_576,
				} as never}
				preview={{
					key: 'hero.png',
					status: 'ready',
					kind: 'image',
					contentType: 'image/png',
					url: 'blob:hero',
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

		const stage = await screen.findByTestId('objects-image-viewer-stage')
		const image = screen.getByTestId('objects-image-viewer-image')

		Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 200 })
		Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 200 })
		Object.defineProperty(image, 'clientWidth', { configurable: true, value: 300 })
		Object.defineProperty(image, 'clientHeight', { configurable: true, value: 300 })

		fireEvent.click(screen.getByTestId('objects-image-viewer-zoom-in'))
		stage.focus()
		expect(stage).toHaveFocus()

		fireEvent.keyDown(stage, { key: 'ArrowUp' })
		expect(image).toHaveStyle({ transform: 'translate3d(0px, -40px, 0) scale(1.5)' })

		fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true })
		expect(image).toHaveStyle({ transform: 'translate3d(80px, -40px, 0) scale(1.5)' })
	})
})
