import { Button, Space, Typography } from 'antd'
import type { ReactNode } from 'react'

import { DialogModal } from '../DialogModal'

type Props = {
	title: string
	summary: string
	sections: ReactNode[]
	onClose: () => void
	onDownload: () => void
}

const verticalSpace = 'vertical' as const

export function MoveCleanupReportDialog(props: Props) {
	return (
		<DialogModal
			open
			onClose={props.onClose}
			title={props.title}
			width={720}
			footer={
				<>
					<Button onClick={props.onClose}>Close</Button>
					<Button type="primary" onClick={props.onDownload}>
						Download report
					</Button>
				</>
			}
		>
				<Space orientation={verticalSpace} size="middle">
				<Typography.Text type="secondary">{props.summary}</Typography.Text>
				{props.sections}
			</Space>
		</DialogModal>
	)
}
