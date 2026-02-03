import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Grid, Layout, Menu, Space, Spin, Typography } from 'antd'
import {
	AppstoreOutlined,
	CloudUploadOutlined,
	FolderOpenOutlined,
	LogoutOutlined,
	MenuOutlined,
	ProfileOutlined,
	SettingOutlined,
	ToolOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useMemo, useState, type CSSProperties } from 'react'

import { APIClient, APIError } from './api/client'
import { JobQueueBanner } from './components/JobQueueBanner'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { TopBarProfileSelect } from './components/TopBarProfileSelect'
import { TransfersButton, TransfersProvider } from './components/Transfers'
import { LoginPage } from './pages/LoginPage'
import { useLocalStorageState } from './lib/useLocalStorageState'

const menuLinkStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 8,
	width: '100%',
	color: 'inherit',
	textDecoration: 'none',
}

const ProfilesPage = lazy(async () => {
	const m = await import('./pages/ProfilesPage')
	return { default: m.ProfilesPage }
})
const BucketsPage = lazy(async () => {
	const m = await import('./pages/BucketsPage')
	return { default: m.BucketsPage }
})
const ObjectsPage = lazy(async () => {
	const m = await import('./pages/ObjectsPage')
	return { default: m.ObjectsPage }
})
const UploadsPage = lazy(async () => {
	const m = await import('./pages/UploadsPage')
	return { default: m.UploadsPage }
})
const JobsPage = lazy(async () => {
	const m = await import('./pages/JobsPage')
	return { default: m.JobsPage }
})
const SettingsDrawer = lazy(async () => {
	const m = await import('./components/SettingsDrawer')
	return { default: m.SettingsDrawer }
})

const { Header, Content, Sider } = Layout

export default function App() {
	const location = useLocation()
	const screens = Grid.useBreakpoint()
	const isDesktop = !!screens.lg

	const [apiToken, setApiToken] = useLocalStorageState('apiToken', '')
	const [profileId, setProfileId] = useLocalStorageState<string | null>('profileId', null)
	const [settingsOpenState, setSettingsOpenState] = useState(false)
	const [navOpen, setNavOpen] = useState(false)
	const [searchParams, setSearchParams] = useSearchParams()
	const settingsOpen = settingsOpenState || searchParams.has('settings')

	const api = useMemo(() => new APIClient({ apiToken }), [apiToken])
	const metaQuery = useQuery({
		queryKey: ['meta', apiToken],
		queryFn: () => api.getMeta(),
		retry: false,
	})

	const selectedKey = useMemo(() => {
		if (location.pathname.startsWith('/profiles')) return '/profiles'
		if (location.pathname.startsWith('/buckets')) return '/buckets'
		if (location.pathname.startsWith('/objects')) return '/objects'
		if (location.pathname.startsWith('/uploads')) return '/uploads'
		if (location.pathname.startsWith('/jobs')) return '/jobs'
		return '/profiles'
	}, [location.pathname])

	const menuItems = useMemo(
		() => [
			{
				key: '/profiles',
				label: (
					<Link to="/profiles" style={menuLinkStyle}>
						<ProfileOutlined />
						<span>Profiles</span>
					</Link>
				),
			},
			{
				key: '/buckets',
				label: (
					<Link to="/buckets" style={menuLinkStyle}>
						<AppstoreOutlined />
						<span>Buckets</span>
					</Link>
				),
			},
			{
				key: '/objects',
				label: (
					<Link to="/objects" style={menuLinkStyle}>
						<FolderOpenOutlined />
						<span>Objects</span>
					</Link>
				),
			},
			{
				key: '/uploads',
				label: (
					<Link to="/uploads" style={menuLinkStyle}>
						<CloudUploadOutlined />
						<span>Uploads</span>
					</Link>
				),
			},
			{
				key: '/jobs',
				label: (
					<Link to="/jobs" style={menuLinkStyle}>
						<ToolOutlined />
						<span>Jobs</span>
					</Link>
				),
			},
		],
		[],
	)

	const uploadDirectStream = metaQuery.data?.uploadDirectStream ?? false

	const openSettings = () => setSettingsOpenState(true)
	const closeSettings = () => {
		setSettingsOpenState(false)
		if (!searchParams.has('settings')) return
		const next = new URLSearchParams(searchParams)
		next.delete('settings')
		setSearchParams(next, { replace: true })
	}

	const logout = () => {
		setApiToken('')
		setProfileId(null)
	}

	// Auth gate (token-based):
	// - If server requires API_TOKEN and we don't have it (or it's wrong), /api/v1/meta returns 401.
	// - If server doesn't require a token, /api/v1/meta works with an empty token.
	if (metaQuery.isPending) {
		return (
			<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
				<Spin />
			</div>
		)
	}

	if (metaQuery.isError) {
		const err = metaQuery.error
		const isUnauthorized = err instanceof APIError && err.status === 401
		if (isUnauthorized) {
			return (
				<LoginPage
					initialToken={apiToken}
					onLogin={(token) => setApiToken(token)}
					onClearSavedToken={() => setApiToken('')}
					error={err}
				/>
			)
		}

		const title = err instanceof APIError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : 'Unknown error'
		const hint =
			err instanceof APIError && err.status === 403
				? 'Access blocked. Try localhost. If you\'re running behind WSL2/containers/private networking, check ALLOW_REMOTE and ALLOWED_HOSTS on the server.'
				: 'Failed to reach the backend. Check that the server is running and that the address/port are correct.'

		return (
			<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
				<div style={{ width: 520, maxWidth: '100%' }}>
					<Typography.Title level={3} style={{ marginTop: 0 }}>
						S3Desk
					</Typography.Title>
					<Alert
						type="error"
						showIcon
						title="Backend connection failed"
						description={
							<Space direction="vertical" size={8} style={{ width: '100%' }}>
								<Typography.Text>{title}</Typography.Text>
								<Typography.Text type="secondary">{hint}</Typography.Text>
								<Button onClick={() => metaQuery.refetch()}>Retry</Button>
							</Space>
						}
					/>
				</div>
			</div>
		)
	}

	return (
		<TransfersProvider apiToken={apiToken} uploadDirectStream={uploadDirectStream}>
			<Layout style={{ minHeight: '100dvh' }}>
				{isDesktop ? (
					<Sider width={220}>
						<div style={{ padding: 16 }}>
							<Typography.Title level={5} style={{ margin: 0, color: 'white' }}>
								S3Desk
							</Typography.Title>
							<Typography.Text style={{ color: 'rgba(255,255,255,0.65)' }}>Local Dashboard</Typography.Text>
						</div>
							<Menu
								theme="dark"
								mode="inline"
								selectedKeys={[selectedKey]}
								items={menuItems}
							/>
					</Sider>
				) : null}

				<Layout>
					<Header
						style={{
							background: 'white',
							borderBottom: '1px solid #f0f0f0',
							paddingInline: screens.md ? 16 : 8,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 8,
							flexWrap: 'wrap',
						}}
					>
						<Space wrap>
							{isDesktop ? null : (
								<Button
									type="text"
									icon={<MenuOutlined />}
									onClick={() => setNavOpen(true)}
									aria-label="Open navigation"
								/>
							)}
							<Typography.Text strong>API</Typography.Text>
							{screens.sm ? (
								<Typography.Text type="secondary">
									<Link to="/profiles">/api/v1</Link>
								</Typography.Text>
							) : null}
						</Space>
						<Space wrap style={{ justifyContent: 'flex-end' }}>
							<TopBarProfileSelect profileId={profileId} setProfileId={setProfileId} apiToken={apiToken} />
							<TransfersButton showLabel={!!screens.sm} />
							<Button type="link" onClick={openSettings} aria-label={screens.sm ? undefined : 'Settings'}>
								<SettingOutlined /> {screens.sm ? 'Settings' : null}
							</Button>
							{apiToken ? (
								<Button type="link" onClick={logout} aria-label={screens.sm ? undefined : 'Logout'}>
									<LogoutOutlined /> {screens.sm ? 'Logout' : null}
								</Button>
							) : null}
						</Space>
					</Header>
					<Content
						style={{
							padding: screens.md ? 16 : 8,
							minHeight: 0,
							display: 'flex',
							flexDirection: 'column',
						}}
					>
						<div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-scroll-container="app-content">
							<div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
								<NetworkStatusBanner />
								<JobQueueBanner />
							</div>
							<Suspense
								fallback={
									<div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
										<Spin />
									</div>
								}
							>
								<Routes>
									<Route
										path="/"
										element={<ProfilesPage apiToken={apiToken} profileId={profileId} setProfileId={setProfileId} />}
									/>
									<Route
										path="/profiles"
										element={<ProfilesPage apiToken={apiToken} profileId={profileId} setProfileId={setProfileId} />}
									/>
									<Route path="/buckets" element={<BucketsPage apiToken={apiToken} profileId={profileId} />} />
									<Route path="/objects" element={<ObjectsPage apiToken={apiToken} profileId={profileId} />} />
									<Route path="/uploads" element={<UploadsPage apiToken={apiToken} profileId={profileId} />} />
									<Route path="/jobs" element={<JobsPage apiToken={apiToken} profileId={profileId} />} />
									<Route path="/settings" element={<Navigate to="/profiles?settings=1" replace />} />
								</Routes>
							</Suspense>
						</div>
					</Content>
				</Layout>

				<Drawer
					open={!isDesktop && navOpen}
					onClose={() => setNavOpen(false)}
					placement="left"
					width="80%"
					bodyStyle={{ padding: 0 }}
				>
					<div style={{ padding: 16 }}>
						<Typography.Title level={5} style={{ margin: 0 }}>
							S3Desk
						</Typography.Title>
						<Typography.Text type="secondary">Local Dashboard</Typography.Text>
					</div>
						<Menu
							mode="inline"
							selectedKeys={[selectedKey]}
							items={menuItems}
							onClick={() => {
								setNavOpen(false)
							}}
						/>
				</Drawer>

				<Suspense fallback={null}>
					<SettingsDrawer
						open={settingsOpen}
						onClose={closeSettings}
						apiToken={apiToken}
						setApiToken={setApiToken}
						profileId={profileId}
						setProfileId={setProfileId}
					/>
				</Suspense>
			</Layout>
		</TransfersProvider>
	)
}
