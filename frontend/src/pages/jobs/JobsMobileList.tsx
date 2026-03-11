import { Tag, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { Job } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { jobTypeLabel } from '../../lib/jobTypes'
import { formatProgress } from './jobPresentation'
import { statusColor } from './jobUtils'
import styles from './JobsTableSection.module.css'

type Props = {
	jobs: Job[]
	getJobSummary: (job: Job) => string | null
	renderJobActions: (job: Job) => ReactNode
}

export function JobsMobileList({ jobs, getJobSummary, renderJobActions }: Props) {
	return (
		<div className={styles.mobileList}>
			{jobs.map((job) => {
				const summary = getJobSummary(job) ?? 'No summary available.'
				const errorText = [job.errorCode, job.error].filter(Boolean).join(' · ')
				return (
					<article key={job.id} className={styles.mobileCard}>
						<div className={styles.mobileCardTop}>
							<div className={styles.mobileCardCopy}>
								<div className={styles.mobileTitleRow}>
									<Tag color={statusColor(job.status)}>{job.status}</Tag>
									<Typography.Text strong>{jobTypeLabel(job.type)}</Typography.Text>
								</div>
								<Typography.Paragraph className={styles.mobileSummary}>{summary}</Typography.Paragraph>
								<Typography.Text code className={styles.mobileJobId}>
									{job.id}
								</Typography.Text>
							</div>
						</div>

						<div className={styles.mobileMetaGrid}>
							<div>
								<div className={styles.mobileMetaLabel}>Created</div>
								<div className={styles.mobileMetaValue}>{job.createdAt ? formatDateTime(job.createdAt) : '-'}</div>
							</div>
							<div>
								<div className={styles.mobileMetaLabel}>Progress</div>
								<div className={styles.mobileMetaValue}>{formatProgress(job.progress)}</div>
							</div>
						</div>

						{errorText ? (
							<div className={styles.mobileError} title={errorText}>
								{errorText}
							</div>
						) : null}

						<div className={styles.mobileActionRow}>
							<div className={styles.mobileInlineActions}>{renderJobActions(job)}</div>
						</div>
					</article>
				)
			})}
		</div>
	)
}
