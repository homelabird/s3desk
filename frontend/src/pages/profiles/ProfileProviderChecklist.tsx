import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Tag, Typography } from 'antd'

import styles from './ProfileModal.module.css'
import type { ProfileChecklistItem, ProfileProviderChecklist } from './profileModalChecklist'

type ProfileProviderChecklistProps = {
	checklist: ProfileProviderChecklist
}

function checklistStatusLabel(status: ProfileChecklistItem['status']): string {
	if (status === 'complete') return 'Ready'
	if (status === 'incomplete') return 'Needs input'
	return 'Optional'
}

function checklistStatusIcon(status: ProfileChecklistItem['status']) {
	if (status === 'complete') return <CheckCircleOutlined aria-hidden="true" />
	if (status === 'incomplete') return <ExclamationCircleOutlined aria-hidden="true" />
	return <InfoCircleOutlined aria-hidden="true" />
}

function checklistStatusTag(status: ProfileChecklistItem['status'], label: string) {
	return (
		<Tag className={styles.providerChecklistStatusTag} data-status={status}>
			{label}
		</Tag>
	)
}

export function ProfileProviderChecklist({ checklist }: ProfileProviderChecklistProps) {
	return (
		<div className={styles.providerChecklist} aria-label={`${checklist.providerLabel} setup checklist`}>
			<div className={styles.providerChecklistHeader}>
				<div className={styles.providerChecklistTitleBlock}>
					<Typography.Text strong>Provider setup checklist</Typography.Text>
					<Typography.Text type="secondary">
						Required fields update as you choose provider and fix validation errors.
					</Typography.Text>
				</div>
				<div className={styles.providerChecklistMeta}>
					{checklistStatusTag(checklist.incompleteCount > 0 ? 'incomplete' : 'complete', checklist.incompleteCount > 0 ? `${checklist.incompleteCount} need input` : 'Ready to save')}
					<Tag>{`${checklist.completeCount} ready`}</Tag>
				</div>
			</div>
			<div className={styles.providerChecklistGroups}>
				{checklist.groups.map((group) => (
					<div key={group.id} className={styles.providerChecklistGroup}>
						<Typography.Text className={styles.providerChecklistGroupTitle}>{group.title}</Typography.Text>
						<div className={styles.providerChecklistItems}>
							{group.items.map((item) => (
								<div key={item.id} className={styles.providerChecklistItem} data-status={item.status}>
									<span className={styles.providerChecklistIcon}>{checklistStatusIcon(item.status)}</span>
									<div className={styles.providerChecklistItemCopy}>
										<Typography.Text className={styles.providerChecklistItemTitle}>{item.title}</Typography.Text>
										<Typography.Text type="secondary" className={styles.providerChecklistItemDetail}>
											{item.detail}
										</Typography.Text>
									</div>
									{checklistStatusTag(item.status, checklistStatusLabel(item.status))}
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
