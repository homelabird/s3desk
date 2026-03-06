import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Spin, Typography } from 'antd'
import {
	AppstoreOutlined,
	CloudUploadOutlined,
	EllipsisOutlined,
	FolderOpenOutlined,
	LogoutOutlined,
	MenuOutlined,
	ProfileOutlined,
	SettingOutlined,
	ToolOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useMemo, useState } from 'react'

import { APIClient, APIError } from './api/client'
import { JobQueueBanner } from './components/JobQueueBanner'
import { KeyboardShortcutGuide } from './components/KeyboardShortcutGuide'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { TopBarProfileSelect } from './components/TopBarProfileSelect'
import { TransfersButton, TransfersProvider } from './components/Transfers'
import { LoginPage } from './pages/LoginPage'
import { getProviderCapabilities } from './lib/providerCapabilities'
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts'
import { useLocalStorageState } from './lib/useLocalStorageState'
import styles from './FullAppInner.module.css'

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

export default function FullAppInner() {
	const location = useLocation()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const isDesktop = !!screens.lg

	const [apiToken, setApiToken] = useLocalStorageState('apiToken', '')
	const [profileId, setProfileId] = useLocalStorageState<string | null>('profileId', null)
	const [navOpen, setNavOpen] = useState(false)
	const [searchParams, setSearchParams] = useSearchParams()
	const settingsOpen = searchParams.has('settings')
	const { guideOpen, setGuideOpen } = useKeyboardShortcuts((path) => navigate(path))

	const api = useMemo(() => new APIClient({ apiToken }), [apiToken])
	const metaQuery = useQuery({
		queryKey: ['meta', apiToken],
		queryFn: () => api.getMeta(),
		retry: false,
	})
	const profilesQuery = useQuery({
		queryKey: ['profiles', apiToken],
		queryFn: () => api.listProfiles(),
	})
	const uploadCapabilityByProfileId = useMemo(() => {
		const out: Record<string, { presignedUpload: boolean; directUpload: boolean }> = {}
		const providerMatrix = metaQuery.data?.capabilities?.providers
		for (const profile of profilesQuery.data ?? []) {
			if (!profile.provider) continue
			const capability = getProviderCapabilities(profile.provider, providerMatrix)
			out[profile.id] = {
				presignedUpload: capability.presignedUpload,
				directUpload: capability.directUpload,
			}
		}
		return out
	}, [metaQuery.data?.capabilities?.providers, profilesQuery.data])

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
					<Link to="/profiles?ui=full" className={styles.menuLink}>
						<ProfileOutlined />
						<span>Profiles</span>
					</Link>
				),
			},
			{
				key: '/buckets',
				label: (
					<Link to="/buckets" className={styles.menuLink}>
						<AppstoreOutlined />
						<span>Buckets</span>
					</Link>
				),
			},
			{
				key: '/objects',
				label: (
					<Link to="/objects" className={styles.menuLink}>
						<FolderOpenOutlined />
						<span>Objects</span>
					</Link>
				),
			},
			{
				key: '/uploads',
				label: (
					<Link to="/uploads" className={styles.menuLink}>
						<CloudUploadOutlined />
						<span>Uploads</span>
					</Link>
				),
			},
			{
				key: '/jobs',
				label: (
					<Link to="/jobs" className={styles.menuLink}>
						<ToolOutlined />
						<span>Jobs</span>
					</Link>
				),
			},
		],
		[],
	)

	const uploadDirectStream = metaQuery.data?.uploadDirectStream ?? false

	const openSettings = () => {
		const next = new URLSearchParams(searchParams)
		next.set('settings', '1')
		setSearchParams(next, { replace: false })
	}
	const closeSettings = () => {
		if (!searchParams.has('settings')) return
		const next = new URLSearchParams(searchParams)
		next.delete('settings')
		setSearchParams(next, { replace: true })
	}

	const logout = () => {
		setApiToken('')
		setProfileId(null)
	}
	const mobileHeaderMenuItems = [
		{ key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
		...(apiToken ? [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true }] : []),
	]

	// Auth gate (token-based):
	// - If server requires API_TOKEN and we don't have it (or it's wrong), /api/v1/meta returns 401.
	// - If server doesn't require a token, /api/v1/meta works with an empty token.
	if (metaQuery.isPending) {
		return (
			<div className={styles.fullscreenCenter}>
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
			err instanceof APIError && err.status === 403 ? (
				<Space orientation="vertical" size={2} className={styles.fullWidth}>
					<Typography.Text type="secondary">Access blocked by server policy.</Typography.Text>
					<Typography.Text type="secondary">On the server host: open the UI from the same machine (loopback).</Typography.Text>
					<Typography.Text type="secondary">
						From another device: open the server&apos;s LAN IP (for example, 192.168.0.200) and verify ALLOW_REMOTE=true, API_TOKEN,
						and (if using a hostname) ALLOWED_HOSTS.
					</Typography.Text>
				</Space>
			) : (
				<Typography.Text type="secondary">
					Failed to reach the backend. Check that the server is running and that the address/port are correct.
				</Typography.Text>
			)

		return (
			<div className={styles.fullscreenCenter}>
				<div className={styles.errorPanel}>
					<Typography.Title level={3} className={styles.noMarginTop}>
						S3Desk
					</Typography.Title>
					<Alert
						type="error"
						showIcon
						title="Backend connection failed"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Typography.Text>{title}</Typography.Text>
								{hint}
								<Button onClick={() => metaQuery.refetch()}>Retry</Button>
							</Space>
						}
					/>
				</div>
			</div>
		)
	}

	return (
		<TransfersProvider
			apiToken={apiToken}
			uploadDirectStream={uploadDirectStream}
			uploadCapabilityByProfileId={uploadCapabilityByProfileId}
		>
			<Layout className={styles.appLayout}>
				{isDesktop ? (
					<Sider width={220} className={styles.desktopSider}>
						<div className={styles.brandBlock}>
							<Typography.Title level={5} className={`${styles.brandTitle} ${styles.brandTitleDesktop}`}>
								S3Desk
							</Typography.Title>
							<Typography.Text className={`${styles.brandSubtitle} ${styles.brandSubtitleDesktop}`}>Local Dashboard</Typography.Text>
						</div>
						<Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
					</Sider>
				) : null}

				<Layout className={styles.appLayout}>
					<Header className={`${styles.header} ${screens.md ? styles.headerPadMd : styles.headerPadSm}`}>
						<Space wrap>
							{isDesktop ? null : (
								<Button
									type="text"
									icon={<MenuOutlined />}
									onClick={() => setNavOpen(true)}
									aria-label="Open navigation"
								/>
							)}
							{isDesktop ? null : (
								<Typography.Text strong className={styles.mobileBrand}>
									S3Desk
								</Typography.Text>
							)}
						</Space>
						<Space wrap className={styles.headerActions}>
							<TopBarProfileSelect profileId={profileId} setProfileId={setProfileId} apiToken={apiToken} />
							<TransfersButton showLabel={!!screens.sm} />
							{screens.sm ? (
								<>
									<Button type="link" onClick={openSettings}>
										<SettingOutlined /> Settings
									</Button>
									{apiToken ? (
										<Button type="link" onClick={logout}>
											<LogoutOutlined /> Logout
										</Button>
									) : null}
								</>
							) : (
								<Dropdown
									trigger={['click']}
									menu={{
										items: mobileHeaderMenuItems,
										onClick: ({ key }) => {
											if (key === 'settings') {
												openSettings()
												return
											}
											if (key === 'logout') {
												logout()
											}
										},
									}}
								>
									<Button type="text" icon={<EllipsisOutlined />} aria-label="More actions" />
								</Dropdown>
								)}
						</Space>
					</Header>
					<Content className={`${styles.content} ${screens.md ? styles.contentPadMd : styles.contentPadSm}`}>
						<main id="main" tabIndex={-1} className={styles.mainScroll} data-scroll-container="app-content">
							<div className={styles.stickyBanners}>
								<NetworkStatusBanner />
								<JobQueueBanner />
							</div>
							<Suspense
								fallback={
									<div className={styles.loadingFallback}>
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
						</main>
					</Content>
				</Layout>

				<Drawer
					open={!isDesktop && navOpen}
					onClose={() => setNavOpen(false)}
					placement="left"
					styles={{ body: { padding: 0 }, wrapper: { width: 'min(80vw, 360px)' } }}
				>
					<div className={styles.brandBlock}>
						<Typography.Title level={5} className={styles.brandTitle}>
							S3Desk
						</Typography.Title>
						<Typography.Text type="secondary" className={styles.brandSubtitle}>
							Local Dashboard
						</Typography.Text>
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
			<KeyboardShortcutGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
		</TransfersProvider>
	)
}
