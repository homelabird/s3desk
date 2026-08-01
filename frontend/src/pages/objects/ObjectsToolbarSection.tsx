import { Alert, Typography } from 'antd'

import type { ObjectsToolbarProps } from './ObjectsToolbar'
import { ObjectsToolbar } from './ObjectsToolbar'
import { AppTabs } from '../../components/AppTabs'
import { LinkButton } from '../../components/LinkButton'
import { ProfileRequiredCallout } from '../../components/ProfileRequiredCallout'
import { failedToLoadBucketsTitle } from '../../lib/actionHints'
import styles from './ObjectsShell.module.css'

type LocationTab = {
	id: string
	bucket: string
	prefix: string
}

type ObjectsToolbarSectionProps = {
	apiToken: string
	profileId: string | null
	bucketsErrorMessage: string | null
	isAdvanced: boolean
	tabs: LocationTab[]
	activeTabId: string
	onTabChange: (id: string) => void
	onTabAdd: () => void
	onTabClose: (id: string) => void
	tabLabelMaxWidth: number
	toolbarProps: ObjectsToolbarProps
}

export function ObjectsToolbarSection(props: ObjectsToolbarSectionProps) {
	const hasTabs = props.isAdvanced && props.tabs.length > 1
	const tabItems = props.tabs.map((t) => {
		const label = t.bucket ? `${t.bucket}${t.prefix ? `/${t.prefix}` : ''}` : '(no bucket selected)'
		return {
			key: t.id,
			label: (
				<Typography.Text ellipsis={{ tooltip: label }} style={{ maxWidth: props.tabLabelMaxWidth, display: 'inline-block' }}>
					{label}
				</Typography.Text>
			),
			closable: props.tabs.length > 1,
			ariaLabel: label,
		}
	})

	const activeKey = props.activeTabId || props.tabs[0]?.id
	const hasProfile = Boolean(props.profileId)
	const hasBucket = Boolean(props.toolbarProps.bucket)

	return (
		<div className={styles.toolbarSectionStack} data-testid="objects-toolbar-section" data-has-tabs={hasTabs ? 'true' : 'false'}>
			<ProfileRequiredCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to start browsing" />
			{hasProfile && props.bucketsErrorMessage ? (
				<Alert
					type="error"
					showIcon
					title={failedToLoadBucketsTitle()}
					description="The bucket list could not be loaded for this profile."
					action={<LinkButton to="/profiles">Check profile</LinkButton>}
					className={styles.pageHeaderAlert}
				/>
			) : null}

			{hasProfile && hasTabs ? (
				<div className={styles.toolbarTabsWrap} data-testid="objects-toolbar-tabs">
					<AppTabs
						type="editable-card"
						semanticRole="toolbar"
						ariaLabel="Object workspaces"
						size="small"
						activeKey={activeKey}
						onChange={(key) => props.onTabChange(String(key))}
						onEdit={(targetKey, action) => {
							if (action === 'add') props.onTabAdd()
							if (action === 'remove') props.onTabClose(String(targetKey))
						}}
						items={tabItems}
					/>
				</div>
			) : null}

			{hasProfile ? <ObjectsToolbar {...props.toolbarProps} /> : null}
			{hasProfile && !hasBucket && !props.bucketsErrorMessage ? (
				<Typography.Text type="secondary" className={styles.toolbarEmptyHint}>
					Choose a bucket to browse objects.
				</Typography.Text>
			) : null}
		</div>
	)
}
