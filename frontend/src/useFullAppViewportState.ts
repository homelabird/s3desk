import { Grid } from 'antd'

export type FullAppViewportState = {
	hasMediumBreakpoint: boolean
	isDesktop: boolean
	isStackedHeader: boolean
	usesCompactHeader: boolean
}

export function useFullAppViewportState(): FullAppViewportState {
	const screens = Grid.useBreakpoint()
	const isDesktop = !!screens.lg

	return {
		hasMediumBreakpoint: !!screens.md,
		isDesktop,
		isStackedHeader: !screens.md,
		usesCompactHeader: !isDesktop,
	}
}
