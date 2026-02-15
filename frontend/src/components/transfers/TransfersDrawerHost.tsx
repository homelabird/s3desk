import { Suspense, lazy } from 'react'

import type { TransfersDrawerProps } from './TransfersDrawer'

const TransfersDrawerLazy = lazy(async () => {
	const m = await import('./TransfersDrawer')
	return { default: m.TransfersDrawer }
})

export function TransfersDrawerHost(props: TransfersDrawerProps) {
	return (
		<Suspense fallback={null}>
			<TransfersDrawerLazy {...props} />
		</Suspense>
	)
}

