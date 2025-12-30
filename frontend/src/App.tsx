import { Button, Drawer, Grid, Layout, Menu, Space, Spin, Typography } from 'antd'
import {
	AppstoreOutlined,
	CloudUploadOutlined,
	FolderOpenOutlined,
	MenuOutlined,
	ProfileOutlined,
	SettingOutlined,
	ToolOutlined,
} from '@ant-design/icons'
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useMemo, useState } from 'react'

import { JobQueueBanner } from './components/JobQueueBanner'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { SettingsDrawer } from './components/SettingsDrawer'
import { TopBarProfileSelect } from './components/TopBarProfileSelect'
import { TransfersButton, TransfersProvider } from './components/Transfers'
import { useLocalStorageState } from './lib/useLocalStorageState'

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

const { Header, Content, Sider } = Layout

export default function App() {
	const navigate = useNavigate()
	const location = useLocation()
	const screens = Grid.useBreakpoint()
	const isDesktop = !!screens.lg

	const [apiToken, setApiToken] = useLocalStorageState('apiToken', '')
	const [profileId, setProfileId] = useLocalStorageState<string | null>('profileId', null)
	const [settingsOpenState, setSettingsOpenState] = useState(false)
	const [navOpen, setNavOpen] = useState(false)
	const [searchParams, setSearchParams] = useSearchParams()
	const settingsOpen = settingsOpenState || searchParams.has('settings')

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
			{ key: '/profiles', icon: <ProfileOutlined />, label: 'Profiles' },
			{ key: '/buckets', icon: <AppstoreOutlined />, label: 'Buckets' },
			{ key: '/objects', icon: <FolderOpenOutlined />, label: 'Objects' },
			{ key: '/uploads', icon: <CloudUploadOutlined />, label: 'Uploads' },
			{ key: '/jobs', icon: <ToolOutlined />, label: 'Jobs' },
		],
		[],
	)

	const openSettings = () => setSettingsOpenState(true)
	const closeSettings = () => {
		setSettingsOpenState(false)
		if (!searchParams.has('settings')) return
		const next = new URLSearchParams(searchParams)
		next.delete('settings')
		setSearchParams(next, { replace: true })
	}

	return (
		<TransfersProvider apiToken={apiToken}>
			<Layout style={{ minHeight: '100dvh' }}>
			{isDesktop ? (
				<Sider width={220}>
					<div style={{ padding: 16 }}>
						<Typography.Title level={5} style={{ margin: 0, color: 'white' }}>
							S3Desk
						</Typography.Title>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.65)' }}>Local Dashboard</Typography.Text>
					</div>
					<Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} onClick={(e) => navigate(e.key)} />
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
							<Button type="text" icon={<MenuOutlined />} onClick={() => setNavOpen(true)} aria-label="Open navigation" />
						)}
						<Typography.Text strong>API</Typography.Text>
						{screens.sm ? (
							<Typography.Text type="secondary">
								<Link to="/profiles">/api/v1</Link>
							</Typography.Text>
						) : null}
					</Space>
					<Space wrap style={{ justifyContent: 'flex-end' }}>
						<TopBarProfileSelect
							profileId={profileId}
							setProfileId={setProfileId}
							apiToken={apiToken}
						/>
						<TransfersButton showLabel={!!screens.sm} />
						<Typography.Link onClick={openSettings}>
							<SettingOutlined /> {screens.sm ? 'Settings' : null}
						</Typography.Link>
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
					onClick={(e) => {
						navigate(e.key)
						setNavOpen(false)
					}}
				/>
			</Drawer>

			<SettingsDrawer
				open={settingsOpen}
				onClose={closeSettings}
				apiToken={apiToken}
				setApiToken={setApiToken}
				profileId={profileId}
				setProfileId={setProfileId}
			/>
			</Layout>
		</TransfersProvider>
	)
}
