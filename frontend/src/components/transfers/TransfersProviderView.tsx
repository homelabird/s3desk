import type { ReactNode } from 'react'

import { TransfersContexts } from '../useTransfers'
import type { TransfersDrawerProps } from './TransfersDrawer'
import type { TransfersContextValue } from './transfersTypes'
import { TransfersDrawerHost } from './TransfersDrawerHost'

export type TransfersProviderViewProps = {
	children: ReactNode
	ctx: TransfersContextValue
	drawerProps: TransfersDrawerProps
}

export function TransfersProviderView({ children, ctx, drawerProps }: TransfersProviderViewProps) {
	return (
		<TransfersContexts value={ctx}>
			{children}
			<TransfersDrawerHost {...drawerProps} />
		</TransfersContexts>
	)
}
