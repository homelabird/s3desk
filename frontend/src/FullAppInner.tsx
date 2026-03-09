import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Grid, Layout, Space, Spin, Typography, type MenuProps } from 'antd'
import {
	AppstoreOutlined,
	CloudUploadOutlined,
	EllipsisOutlined,
	FolderOpenOutlined,
	LogoutOutlined,
	MenuOutlined,
	MoonOutlined,
	ProfileOutlined,
	SettingOutlined,
	SunOutlined,
	ToolOutlined,
} from '@ant-design/icons'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react'

import { APIClient, APIError } from './api/client'
import { BrandLockup } from './components/BrandLockup'
import { JobQueueBanner } from './components/JobQueueBanner'
import { MenuPopover } from './components/MenuPopover'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { OverlaySheet } from './components/OverlaySheet'
import { TopBarProfileSelect } from './components/TopBarProfileSelect'
import { TransfersButton, TransfersProvider } from './components/TransfersShell'
import { getProviderCapabilities } from './lib/providerCapabilities'
import { reloadPage } from './lib/reloadPage'
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts'
import { useLocalStorageState } from './lib/useLocalStorageState'
import { useSessionStorageState } from './lib/useSessionStorageState'
import { useThemeMode } from './useThemeMode'
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
const KeyboardShortcutGuide = lazy(async () => {
	const m = await import('./components/KeyboardShortcutGuide')
	return { default: m.KeyboardShortcutGuide }
})
const LoginPage = lazy(async () => {
	const m = await import('./pages/LoginPage')
	return { default: m.LoginPage }
})

const { Header, Content, Sider } = Layout

type NavItem = {
	key: string
	label: string
	icon: ReactNode
	to: string
}

export default function FullAppInner() {
	const location = useLocation()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const isDesktop = !!screens.lg
	const isStackedHeader = !screens.md
	const usesCompactHeader = !isDesktop
	const { mode, toggleMode } = useThemeMode()

	const [apiToken, setApiToken] = useSessionStorageState('apiToken', '', { legacyLocalStorageKey: 'apiToken' })
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
			const capability = getProviderCapabilities(profile.provider, providerMatrix, profile)
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

	const navItems = useMemo<NavItem[]>(
		() => [
			{ key: '/profiles', label: 'Profiles', icon: <ProfileOutlined />, to: '/profiles' },
			{ key: '/buckets', label: 'Buckets', icon: <AppstoreOutlined />, to: '/buckets' },
			{ key: '/objects', label: 'Objects', icon: <FolderOpenOutlined />, to: '/objects' },
			{ key: '/uploads', label: 'Uploads', icon: <CloudUploadOutlined />, to: '/uploads' },
			{ key: '/jobs', label: 'Jobs', icon: <ToolOutlined />, to: '/jobs' },
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
	const compactHeaderMenu: MenuProps = {
		items: [
		{ key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
		...(apiToken ? [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true }] : []),
		],
		onClick: ({ key }) => {
			if (key === 'settings') {
				openSettings()
				return
			}
			if (key === 'logout') logout()
		},
	}

	const renderNav = (onSelect?: () => void) => (
		<nav className={styles.navList} aria-label="Primary">
			{navItems.map((item) => (
				<Link
					key={item.key}
					to={item.to}
					onClick={onSelect}
					className={[
						styles.navLink,
						selectedKey === item.key ? styles.navLinkActive : '',
					]
						.filter(Boolean)
						.join(' ')}
				>
					{item.icon}
					<span>{item.label}</span>
				</Link>
			))}
		</nav>
	)

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
				<Suspense fallback={<div className={styles.fullscreenCenter}><Spin /></div>}>
					<LoginPage
						initialToken={apiToken}
						onLogin={(token) => setApiToken(token)}
						onClearSavedToken={() => setApiToken('')}
						error={err}
					/>
				</Suspense>
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
					<BrandLockup titleAs="h1" subtitle="Local Dashboard" variant="hero" />
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
							<button
								type="button"
								className={styles.desktopBrandButton}
								onClick={reloadPage}
								aria-label="Refresh current page"
								title="Refresh current page"
							>
								<BrandLockup subtitle="Local Dashboard" variant="sidebar" />
							</button>
						</div>
						{renderNav()}
					</Sider>
				) : null}

				<Layout className={styles.appLayout}>
					<Header
						className={[
							styles.header,
							screens.md ? styles.headerPadMd : styles.headerPadSm,
							usesCompactHeader ? styles.headerCompact : '',
							isStackedHeader ? styles.headerStacked : '',
						]
							.filter(Boolean)
							.join(' ')}
						data-testid="app-header"
					>
						<div className={styles.headerTopRow}>
							<div className={styles.headerLeading}>
								{isDesktop ? null : (
									<Button
										type="text"
										icon={<MenuOutlined />}
										onClick={() => setNavOpen(true)}
										aria-label="Open navigation"
									/>
								)}
								{isDesktop ? null : (
									<button
										type="button"
										className={styles.mobileBrandButton}
										onClick={reloadPage}
										aria-label="Refresh current page"
										title="Refresh current page"
									>
										<BrandLockup variant="compact" className={styles.mobileBrandLockup} />
									</button>
								)}
							</div>
							<div className={styles.headerActions}>
								<Button
									type={isDesktop ? 'link' : 'text'}
									icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
									onClick={toggleMode}
									aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
								>
									{isDesktop ? (mode === 'dark' ? 'Light mode' : 'Dark mode') : null}
								</Button>
								{isStackedHeader ? null : (
									<TopBarProfileSelect
										profileId={profileId}
										setProfileId={setProfileId}
										apiToken={apiToken}
										showLabel={isDesktop}
										selectWidth={isDesktop ? 260 : 180}
										className={styles.headerProfileSelect}
									/>
								)}
								{isStackedHeader ? null : <TransfersButton showLabel={isDesktop} ariaLabel="Transfers" />}
								{isDesktop ? (
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
									<MenuPopover menu={compactHeaderMenu} align="end">
										{({ toggle }) => (
											<Button type="text" icon={<EllipsisOutlined />} aria-label="More actions" onClick={toggle} />
										)}
									</MenuPopover>
								)}
							</div>
						</div>
						{isStackedHeader ? (
							<div className={styles.headerProfileRow} data-testid="app-header-profile-row">
								<TopBarProfileSelect
									profileId={profileId}
									setProfileId={setProfileId}
									apiToken={apiToken}
									showLabel={false}
									fullWidth
									selectWidth="100%"
									className={styles.headerProfileSelect}
								/>
								<TransfersButton showLabel={false} ariaLabel="Transfers" className={styles.headerTransfersButton} />
							</div>
						) : null}
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

				<OverlaySheet
					open={!isDesktop && navOpen}
					onClose={() => setNavOpen(false)}
					placement="left"
					title="Navigation"
					width="min(80vw, 360px)"
					bodyClassName={styles.navSheetBody}
				>
					<div className={styles.brandBlock}>
						<button
							type="button"
							className={styles.desktopBrandButton}
							onClick={reloadPage}
							aria-label="Refresh current page"
							title="Refresh current page"
						>
							<BrandLockup subtitle="Local Dashboard" />
						</button>
					</div>
					{renderNav(() => setNavOpen(false))}
				</OverlaySheet>

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
			<Suspense fallback={null}>
				<KeyboardShortcutGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
			</Suspense>
		</TransfersProvider>
	)
}
