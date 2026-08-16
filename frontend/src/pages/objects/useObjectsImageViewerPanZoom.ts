import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type TouchEvent as ReactTouchEvent,
} from 'react'

import { clampNumber } from './objectsListUtils'

export const IMAGE_VIEWER_MIN_SCALE = 1
export const IMAGE_VIEWER_MAX_SCALE = 4
export const IMAGE_VIEWER_SCALE_STEP = 0.5
const IMAGE_VIEWER_KEYBOARD_PAN_STEP = 40

export type ImageViewerPanOffset = {
	x: number
	y: number
}

export type ImageViewerDragState = {
	pointerId: number
	startX: number
	startY: number
	origin: ImageViewerPanOffset
}

type ImageViewerPinchState = {
	distance: number
	scale: number
}

function getTouchDistance(touches: ReactTouchEvent<HTMLDivElement>['touches']): number {
	const first = touches[0]
	const second = touches[1]
	if (!first || !second) return 0
	return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

function clampPanOffset(
	scale: number,
	offset: ImageViewerPanOffset,
	stageEl: HTMLDivElement | null,
	imageEl: HTMLImageElement | null,
): ImageViewerPanOffset {
	if (!stageEl || !imageEl || scale <= IMAGE_VIEWER_MIN_SCALE) return { x: 0, y: 0 }
	const stageWidth = stageEl.clientWidth
	const stageHeight = stageEl.clientHeight
	const baseWidth = imageEl.clientWidth
	const baseHeight = imageEl.clientHeight
	const maxX = Math.max(0, (baseWidth * scale - stageWidth) / 2)
	const maxY = Math.max(0, (baseHeight * scale - stageHeight) / 2)
	return {
		x: clampNumber(offset.x, -maxX, maxX),
		y: clampNumber(offset.y, -maxY, maxY),
	}
}

export function useObjectsImageViewerPanZoom(visualPreviewReady: boolean) {
	const [scale, setScale] = useState(IMAGE_VIEWER_MIN_SCALE)
	const [offset, setOffset] = useState<ImageViewerPanOffset>({ x: 0, y: 0 })
	const [dragState, setDragState] = useState<ImageViewerDragState | null>(null)
	const stageRef = useRef<HTMLDivElement | null>(null)
	const imageRef = useRef<HTMLImageElement | null>(null)
	const pinchStateRef = useRef<ImageViewerPinchState | null>(null)

	const resetView = useCallback(() => {
		setScale(IMAGE_VIEWER_MIN_SCALE)
		setOffset({ x: 0, y: 0 })
		setDragState(null)
		pinchStateRef.current = null
	}, [])

	useEffect(() => {
		setOffset((current) => clampPanOffset(scale, current, stageRef.current, imageRef.current))
	}, [scale])

	const updateScale = useCallback((nextScale: number) => {
		const normalized = Math.round(nextScale * 100) / 100
		setScale(clampNumber(normalized, IMAGE_VIEWER_MIN_SCALE, IMAGE_VIEWER_MAX_SCALE))
	}, [])

	useEffect(() => {
		const stage = stageRef.current
		if (!stage || !visualPreviewReady) return
		const handleWheel = (event: WheelEvent) => {
			if (event.deltaY === 0) return
			event.preventDefault()
			updateScale(scale + (event.deltaY < 0 ? IMAGE_VIEWER_SCALE_STEP : -IMAGE_VIEWER_SCALE_STEP))
		}
		stage.addEventListener('wheel', handleWheel, { passive: false })
		return () => stage.removeEventListener('wheel', handleWheel)
	}, [scale, updateScale, visualPreviewReady])

	const handleTouchStart = useCallback(
		(event: ReactTouchEvent<HTMLDivElement>) => {
			if (!visualPreviewReady || event.touches.length !== 2) return
			const distance = getTouchDistance(event.touches)
			if (distance <= 0) return
			setDragState(null)
			pinchStateRef.current = { distance, scale }
		},
		[scale, visualPreviewReady],
	)

	const handleTouchMove = useCallback(
		(event: ReactTouchEvent<HTMLDivElement>) => {
			const pinchState = pinchStateRef.current
			if (!pinchState || event.touches.length !== 2) return
			const distance = getTouchDistance(event.touches)
			if (distance <= 0) return
			updateScale(pinchState.scale * (distance / pinchState.distance))
		},
		[updateScale],
	)

	const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
		if (event.touches.length < 2) pinchStateRef.current = null
	}, [])

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (scale <= IMAGE_VIEWER_MIN_SCALE || !visualPreviewReady) return
			event.preventDefault()
			event.currentTarget.setPointerCapture(event.pointerId)
			setDragState({
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				origin: offset,
			})
		},
		[offset, scale, visualPreviewReady],
	)

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (!dragState || dragState.pointerId !== event.pointerId) return
			event.preventDefault()
			const next = clampPanOffset(
				scale,
				{
					x: dragState.origin.x + (event.clientX - dragState.startX),
					y: dragState.origin.y + (event.clientY - dragState.startY),
				},
				stageRef.current,
				imageRef.current,
			)
			setOffset(next)
		},
		[dragState, scale],
	)

	const handlePointerEnd = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (!dragState || dragState.pointerId !== event.pointerId) return
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId)
			}
			setDragState(null)
		},
		[dragState],
	)

	const handleStageKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (scale <= IMAGE_VIEWER_MIN_SCALE || !visualPreviewReady) return
			const step = event.shiftKey ? IMAGE_VIEWER_KEYBOARD_PAN_STEP * 2 : IMAGE_VIEWER_KEYBOARD_PAN_STEP
			const deltas: Partial<Record<string, ImageViewerPanOffset>> = {
				ArrowUp: { x: 0, y: -step },
				ArrowDown: { x: 0, y: step },
				ArrowLeft: { x: -step, y: 0 },
				ArrowRight: { x: step, y: 0 },
			}
			const delta = deltas[event.key]
			if (!delta) return
			event.preventDefault()
			setOffset((current) =>
				clampPanOffset(
					scale,
					{
						x: current.x + delta.x,
						y: current.y + delta.y,
					},
					stageRef.current,
					imageRef.current,
				),
			)
		},
		[scale, visualPreviewReady],
	)

	return {
		dragState,
		handlePointerDown,
		handlePointerEnd,
		handlePointerMove,
		handleStageKeyDown,
		handleTouchEnd,
		handleTouchMove,
		handleTouchStart,
		imageRef,
		offset,
		resetView,
		scale,
		stageRef,
		updateScale,
	}
}
