import { Alert, Grid, Space, Typography } from 'antd'
import { useLocation } from 'react-router-dom'

import { LinkButton } from './LinkButton'

type Props = {
	apiToken: string
	profileId: string | null
	message?: string
	description?: string
}

export function SetupCallout(props: Props) {
	const location = useLocation()
	const screens = Grid.useBreakpoint()

	if (props.profileId) return null

	const settingsParams = new URLSearchParams(location.search)
	settingsParams.set('settings', '1')
	const settingsSearch = settingsParams.toString()
	const settingsHref = `${location.pathname}?${settingsSearch}`

	const showSettings = props.apiToken === ''
	const actionDirection = screens.sm ? 'horizontal' : 'vertical'
	const description =
		props.description ?? (
			<Space orientation="vertical" size={4}>
				<Typography.Text type="secondary">Profiles store your S3 endpoint and credentials.</Typography.Text>
				{showSettings ? (
					<Typography.Text type="secondary">If your server uses API_TOKEN, set it in Settings.</Typography.Text>
				) : null}
			</Space>
		)

	return (
		<Alert
			type="warning"
			showIcon
			title={props.message ?? 'Select a profile to continue'}
			description={description}
			action={
				<Space orientation={actionDirection} size="small">
					<LinkButton to="/profiles?ui=full" size="small">
						Profiles
					</LinkButton>
					{showSettings ? (
						<LinkButton to={settingsHref} size="small">
							Settings
						</LinkButton>
					) : null}
				</Space>
			}
		/>
	)
}
