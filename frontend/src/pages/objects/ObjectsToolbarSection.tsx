import { Alert, Tabs, Typography } from 'antd'

import type { ObjectsToolbarProps } from './ObjectsToolbar'
import { ObjectsToolbar } from './ObjectsToolbar'
import { SetupCallout } from '../../components/SetupCallout'

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
		}
	})

	const activeKey = props.activeTabId || props.tabs[0]?.id

	return (
		<>
			<SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to start browsing" />
			{props.bucketsErrorMessage ? (
				<Alert type="error" showIcon message="Failed to load buckets" description={props.bucketsErrorMessage} />
			) : null}

			{props.isAdvanced && props.tabs.length > 1 ? (
				<Tabs
					type="editable-card"
					size="small"
					activeKey={activeKey}
					onChange={(key) => props.onTabChange(String(key))}
					onEdit={(targetKey, action) => {
						if (action === 'add') props.onTabAdd()
						if (action === 'remove') props.onTabClose(String(targetKey))
					}}
					items={tabItems}
				/>
			) : null}

			<ObjectsToolbar {...props.toolbarProps} />
		</>
	)
}
