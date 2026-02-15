import type { ReactNode } from 'react'

import type { TransfersContextValue } from '../Transfers'
import { TransfersContext } from '../useTransfers'
import type { TransfersDrawerProps } from './TransfersDrawer'
import { TransfersDrawerHost } from './TransfersDrawerHost'

export type TransfersProviderViewProps = {
	children: ReactNode
	ctx: TransfersContextValue
	drawerProps: TransfersDrawerProps
}

export function TransfersProviderView({ children, ctx, drawerProps }: TransfersProviderViewProps) {
	return (
		<TransfersContext.Provider value={ctx}>
			{children}
			<TransfersDrawerHost {...drawerProps} />
		</TransfersContext.Provider>
	)
}

