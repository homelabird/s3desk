import { Alert } from 'antd'
import { useEffect, useState } from 'react'

import { subscribeJobQueueBanner, type JobQueueBannerDetail } from '../lib/jobQueue'

export function JobQueueBanner() {
	const [banner, setBanner] = useState<JobQueueBannerDetail | null>(null)

	useEffect(() => {
		return subscribeJobQueueBanner(
			(detail) => setBanner(detail),
			() => setBanner(null),
		)
	}, [])

	if (!banner) return null

	return <Alert banner showIcon type={banner.type ?? 'warning'} message={banner.message} style={{ marginBottom: 8 }} />
}
