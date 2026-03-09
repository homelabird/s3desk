import { Button, Space, Typography, message } from 'antd'
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import type { TransfersRuntimeNotifications } from './transfersTypes'

export function useTransfersRuntimeNotifications(): TransfersRuntimeNotifications {
	const navigate = useNavigate()

	const info = useCallback((content: string) => {
		message.info(content)
	}, [])

	const warning = useCallback((content: string) => {
		message.warning(content)
	}, [])

	const error = useCallback((content: string) => {
		message.error(content)
	}, [])

	const uploadCommitted = useCallback(
		(jobId?: string) => {
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Upload committed{jobId ? ` (job ${jobId})` : ''}</Typography.Text>
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
