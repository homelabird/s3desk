import { Button, Space, Typography } from 'antd'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'

import { transfersFeedback, transfersFeedbackCopy } from './transfersFeedback'
import type { TransfersRuntimeNotifications } from './transfersTypes'

export function useTransfersRuntimeNotifications(): TransfersRuntimeNotifications {
	const navigate = useNavigate()

	const info = useCallback((content: string) => {
		transfersFeedback.info(content)
	}, [])

	const warning = useCallback((content: string) => {
		transfersFeedback.warning(content)
	}, [])

	const error = useCallback((content: string) => {
		transfersFeedback.errorText(content)
	}, [])

	const uploadCommitted = useCallback(
		(jobId?: string) => {
			transfersFeedback.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>{transfersFeedbackCopy.uploadCommitted(jobId)}</Typography.Text>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
		},
		[navigate],
	)

	return useMemo(
		() => ({
			info,
			warning,
			error,
			uploadCommitted,
		}),
		[error, info, uploadCommitted, warning],
	)
}
