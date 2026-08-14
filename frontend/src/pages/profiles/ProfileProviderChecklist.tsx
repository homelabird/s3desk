import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { Typography } from 'antd'

import styles from './ProfileModal.module.css'
import type { ProfileProviderChecklist } from './profileModalChecklist'

type ProfileProviderChecklistProps = {
	checklist: ProfileProviderChecklist
}

export function ProfileProviderChecklist({ checklist }: ProfileProviderChecklistProps) {
	const attentionItems = checklist.groups.flatMap((group) => group.items).filter((item) => item.status === 'incomplete')
	const isReady = attentionItems.length === 0

	return (
		<section className={styles.providerChecklist} data-status={isReady ? 'complete' : 'incomplete'} aria-label={`${checklist.providerLabel} setup status`}>
			<span className={styles.providerChecklistIcon}>
				{isReady ? <CheckCircleOutlined aria-hidden="true" /> : <ExclamationCircleOutlined aria-hidden="true" />}
			</span>
			<div className={styles.providerChecklistBody}>
				<div className={styles.providerChecklistHeader}>
					<Typography.Text strong>{isReady ? 'Ready to save' : 'Before saving'}</Typography.Text>
					<Typography.Text type="secondary" className={styles.providerChecklistSummary}>
						{isReady
							? 'Required settings are complete.'
							: `${attentionItems.length} ${attentionItems.length === 1 ? 'item needs' : 'items need'} attention.`}
					</Typography.Text>
				</div>
				{isReady ? null : (
					<ul className={styles.providerChecklistItems}>
						{attentionItems.map((item) => <li key={item.id}>{item.detail}</li>)}
					</ul>
				)}
			</div>
		</section>
	)
}
