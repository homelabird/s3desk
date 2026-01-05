import { Alert, Button, Grid, Space, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'

type Props = {
	apiToken: string
	profileId: string | null
	message?: string
	description?: string
}

export function SetupCallout(props: Props) {
	const navigate = useNavigate()
	const location = useLocation()
	const screens = Grid.useBreakpoint()

	if (props.profileId) return null

	const openProfiles = () => {
		navigate('/profiles')
	}

	const openSettings = () => {
		const next = new URLSearchParams(location.search)
		next.set('settings', '1')
		navigate({ pathname: location.pathname, search: `?${next.toString()}` })
	}

	const showSettings = props.apiToken === ''
	const actionDirection = screens.sm ? 'horizontal' : 'vertical'
	const description =
		props.description ?? (
			<Space direction="vertical" size={4}>
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
			message={props.message ?? 'Select a profile to continue'}
			description={description}
			action={
				<Space direction={actionDirection} size="small">
					<Button size="small" onClick={openProfiles}>
						Profiles
					</Button>
					{showSettings ? (
						<Button size="small" onClick={openSettings}>
							Settings
						</Button>
					) : null}
				</Space>
			}
		/>
	)
}
