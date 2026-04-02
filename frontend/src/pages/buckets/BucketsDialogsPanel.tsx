import type { ComponentProps } from 'react'

import { BucketsDialogsHost } from './BucketsDialogsHost'

type Props = ComponentProps<typeof BucketsDialogsHost>

export function BucketsDialogsPanel(props: Props) {
	return <BucketsDialogsHost {...props} />
}
