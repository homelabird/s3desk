import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Descriptions, Divider, Drawer, Form, Grid, Input, Space, Spin, Tag, Typography } from 'antd'
import { useMemo } from 'react'

import { APIClient, APIError } from '../api/client'

type Props = {
	open: boolean
	onClose: () => void
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
}

export function SettingsDrawer(props: Props) {
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 480 : '100%'

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
		enabled: props.open,
		retry: false,
	})

	return (
		<Drawer
			open={props.open}
			onClose={props.onClose}
			title="Settings"
			width={drawerWidth}
			extra={
				<Space>
					<Button onClick={props.onClose}>Close</Button>
				</Space>
			}
		>
			<Form layout="vertical">
				<Form.Item label="Backend API Token (X-Api-Token)">
					<Input.Password
						placeholder="Must match API_TOKEN"
						value={props.apiToken}
						onChange={(e) => props.setApiToken(e.target.value)}
						autoComplete="current-password"
					/>
					<Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
						This must match the server's <Typography.Text code>API_TOKEN</Typography.Text> (or{' '}
						<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials or{' '}
						<Typography.Text code>s5cmd</Typography.Text>.
					</Typography.Paragraph>
				</Form.Item>

				<Form.Item label="Selected Profile">
					<Space.Compact style={{ width: '100%' }}>
						<Input value={props.profileId ?? ''} placeholder="(none)" readOnly />
						<Button danger onClick={() => props.setProfileId(null)}>
							Clear
						</Button>
					</Space.Compact>
				</Form.Item>
			</Form>

			<Divider titlePlacement="left">Server</Divider>

			{metaQuery.isFetching && !metaQuery.data ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
					<Spin />
				</div>
			) : null}

			{metaQuery.isError ? (
				<Alert
					type="error"
					showIcon
					message="Failed to load /meta"
					description={formatErr(metaQuery.error)}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			{metaQuery.data ? (
				<Descriptions size="small" bordered column={1}>
					<Descriptions.Item label="Version">{metaQuery.data.version}</Descriptions.Item>
					<Descriptions.Item label="Server Addr">
						<Typography.Text code>{metaQuery.data.serverAddr}</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item label="Data Dir">
						<Typography.Text code>{metaQuery.data.dataDir}</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item label="Static Dir">
						<Typography.Text code>{metaQuery.data.staticDir}</Typography.Text>
					</Descriptions.Item>
					<Descriptions.Item label="API Token Required">
						<Tag color={metaQuery.data.apiTokenEnabled ? 'warning' : 'default'}>
							{metaQuery.data.apiTokenEnabled ? 'enabled' : 'disabled'}
						</Tag>
					</Descriptions.Item>
					<Descriptions.Item label="Encryption">
						<Tag color={metaQuery.data.encryptionEnabled ? 'success' : 'default'}>
							{metaQuery.data.encryptionEnabled ? 'enabled' : 'disabled'}
						</Tag>
					</Descriptions.Item>
					<Descriptions.Item label="Allowed Local Dirs">
						{metaQuery.data.allowedLocalDirs?.length ? (
							<Typography.Text code>{metaQuery.data.allowedLocalDirs.join(', ')}</Typography.Text>
						) : (
							<Typography.Text type="secondary">(not configured)</Typography.Text>
						)}
					</Descriptions.Item>
					<Descriptions.Item label="Job Concurrency">{metaQuery.data.jobConcurrency}</Descriptions.Item>
					<Descriptions.Item label="Job Log Max Bytes">
						{metaQuery.data.jobLogMaxBytes ? (
							<Typography.Text code>{metaQuery.data.jobLogMaxBytes}</Typography.Text>
						) : (
							<Typography.Text type="secondary">(unlimited)</Typography.Text>
						)}
					</Descriptions.Item>
					<Descriptions.Item label="Job Retention (seconds)">
						{metaQuery.data.jobRetentionSeconds ? (
							<Typography.Text code>{metaQuery.data.jobRetentionSeconds}</Typography.Text>
						) : (
							<Typography.Text type="secondary">(keep forever)</Typography.Text>
						)}
					</Descriptions.Item>
					<Descriptions.Item label="Upload Session TTL (seconds)">
						{metaQuery.data.uploadSessionTTLSeconds}
					</Descriptions.Item>
					<Descriptions.Item label="Upload Max Bytes">
						{metaQuery.data.uploadMaxBytes ? (
							<Typography.Text code>{metaQuery.data.uploadMaxBytes}</Typography.Text>
						) : (
							<Typography.Text type="secondary">(unlimited)</Typography.Text>
						)}
					</Descriptions.Item>
					<Descriptions.Item label="s5cmd">
						<Space>
							<Tag color={metaQuery.data.s5cmd.available ? 'success' : 'default'}>
								{metaQuery.data.s5cmd.available ? 'available' : 'missing'}
							</Tag>
							{metaQuery.data.s5cmd.version ? <Typography.Text code>{metaQuery.data.s5cmd.version}</Typography.Text> : null}
							{metaQuery.data.s5cmd.path ? <Typography.Text code>{metaQuery.data.s5cmd.path}</Typography.Text> : null}
						</Space>
					</Descriptions.Item>
				</Descriptions>
			) : null}
		</Drawer>
	)
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}
