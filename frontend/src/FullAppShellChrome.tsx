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
import type { MenuProps } from 'antd'
import { Button, Layout } from 'antd'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

import type { APIClientShape } from './api/client'
import type { MetaResponse } from './api/types'
import { APP_NAVIGATION_DRAWER_ID, APP_SETTINGS_DRAWER_ID } from './appShellIds'
import { BrandLockup } from './components/BrandLockup'
import { MenuPopover } from './components/MenuPopover'
import { OverlaySheet } from './components/OverlaySheet'
import { SidebarBackupAction } from './components/SidebarBackupAction'
import { TopBarProfileSelect } from './components/TopBarProfileSelect'
import { TransfersButton } from './components/TransfersShell'
import type { ThemeMode } from './themeModeContext'
import type { FullAppViewportState } from './useFullAppViewportState'
import styles from './FullAppInner.module.css'

const { Header, Sider } = Layout

type NavItem = {
	key: string
	label: string
	icon: ReactNode
	to: string
}

const NAV_ITEMS: NavItem[] = [
	{ key: '/profiles', label: 'Profiles', icon: <ProfileOutlined />, to: '/profiles' },
	{ key: '/buckets', label: 'Buckets', icon: <AppstoreOutlined />, to: '/buckets' },
	{ key: '/objects', label: 'Objects', icon: <FolderOpenOutlined />, to: '/objects' },
	{ key: '/uploads', label: 'Uploads', icon: <CloudUploadOutlined />, to: '/uploads' },
	{ key: '/jobs', label: 'Jobs', icon: <ToolOutlined />, to: '/jobs' },
]
export type FullAppShellChromeSession = {
	api: APIClientShape
	meta?: MetaResponse
	apiToken: string
	profileId: string | null
	setProfileId: (profileId: string | null) => void
	shellScopeKey: string
	selectedKey: string
	navOpen: boolean
	settingsOpen: boolean
	openNav: () => void
	closeNav: () => void
	openSettings: () => void
	logout: () => void
	compactHeaderMenu: MenuProps
}

export type FullAppShellChromeTheme = {
	mode: ThemeMode
	toggleMode: () => void
}

export type FullAppShellChromeProps = {
	session: FullAppShellChromeSession
	theme: FullAppShellChromeTheme
	viewport: FullAppViewportState
	children: ReactNode
}

function AppNavigation(props: {
	api: APIClientShape
	meta?: MetaResponse
	selectedKey: string
	shellScopeKey: string
	onSelect?: () => void
}) {
	return (
		<div className={styles.navColumn}>
			<nav className={styles.navList} aria-label="Primary">
				{NAV_ITEMS.map((item) => (
					<Link
						key={item.key}
						to={item.to}
						onClick={props.onSelect}
						aria-current={props.selectedKey === item.key ? 'page' : undefined}
						className={[
							styles.navLink,
							props.selectedKey === item.key ? styles.navLinkActive : '',
						]
							.filter(Boolean)
							.join(' ')}
					>
						{item.icon}
						<span>{item.label}</span>
					</Link>
				))}
			</nav>
			<div className={styles.navFooter}>
				<SidebarBackupAction
					api={props.api}
					meta={props.meta}
					onActionComplete={props.onSelect}
					scopeKey={props.shellScopeKey}
				/>
			</div>
		</div>
	)
}

export function FullAppShellChrome({
	session,
	theme,
	viewport,
	children,
}: FullAppShellChromeProps) {
	const {
		api,
		meta,
		apiToken,
		profileId,
		setProfileId,
		shellScopeKey,
		selectedKey,
		navOpen,
		settingsOpen,
		openNav,
		closeNav,
		openSettings,
		logout,
		compactHeaderMenu,
	} = session
	const { mode, toggleMode } = theme
	const { isDesktop, isStackedHeader, usesCompactHeader, hasMediumBreakpoint } =
		viewport
	const contentClassName = `${styles.content} ${hasMediumBreakpoint ? styles.contentPadMd : styles.contentPadSm}`
	const shellClassName = `${styles.appLayout} ${styles.appShell}`
	const headerClassName = [
		styles.header,
		hasMediumBreakpoint ? styles.headerPadMd : styles.headerPadSm,
		usesCompactHeader ? styles.headerCompact : '',
		isStackedHeader ? styles.headerStacked : '',
	]
		.filter(Boolean)
		.join(' ')

	return (
		<Layout className={styles.appLayout}>
			<a className={styles.skipLink} href="#main">
				Skip to content
			</a>
			{isDesktop ? (
				<Sider width={220} className={styles.desktopSider}>
					<div className={styles.brandBlock}>
						<Link
							to={profileId ? '/objects' : '/profiles'}
							className={styles.desktopBrandButton}
							aria-label={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
							title={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
						>
							<BrandLockup subtitle="Local Dashboard" variant="sidebar" />
						</Link>
					</div>
					<AppNavigation
						api={api}
						meta={meta}
						selectedKey={selectedKey}
						shellScopeKey={shellScopeKey}
					/>
				</Sider>
			) : null}

			<Layout className={shellClassName}>
				<Header className={headerClassName} data-testid="app-header">
					<div className={styles.headerTopRow}>
						<div className={styles.headerLeading}>
							{isDesktop ? null : (
								<Button
									type="text"
									icon={<MenuOutlined />}
									onClick={openNav}
									aria-label="Open navigation"
									aria-haspopup="dialog"
									aria-expanded={!isDesktop && navOpen}
									aria-controls={APP_NAVIGATION_DRAWER_ID}
								/>
							)}
							{isDesktop ? null : (
								<Link
									to={profileId ? '/objects' : '/profiles'}
									className={styles.mobileBrandButton}
									aria-label={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
									title={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
								>
									<BrandLockup variant="compact" className={styles.mobileBrandLockup} />
								</Link>
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
									<Button
										type="link"
										onClick={openSettings}
										aria-haspopup="dialog"
										aria-expanded={settingsOpen}
										aria-controls={APP_SETTINGS_DRAWER_ID}
									>
										<SettingOutlined /> Settings
									</Button>
									{apiToken ? (
										<Button type="link" onClick={logout}>
											<LogoutOutlined /> Logout
										</Button>
									) : null}
								</>
							) : (
								<MenuPopover menu={compactHeaderMenu} align="end" scopeKey={shellScopeKey}>
									{({ toggle, open }) => (
										<Button
											type="text"
											icon={<EllipsisOutlined />}
											aria-label="More actions"
											aria-haspopup="menu"
											aria-expanded={open}
											onClick={toggle}
										/>
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
							<TransfersButton
								showLabel={false}
								ariaLabel="Transfers"
								className={styles.headerTransfersButton}
							/>
						</div>
					) : null}
				</Header>
				<div className={contentClassName}>{children}</div>
			</Layout>

			<OverlaySheet
				open={!isDesktop && navOpen}
				onClose={closeNav}
				placement="left"
				title="Navigation"
				width="min(80vw, 360px)"
				bodyClassName={styles.navSheetBody}
				sheetId={APP_NAVIGATION_DRAWER_ID}
			>
				<div className={styles.brandBlock}>
					<Link
						to={profileId ? '/objects' : '/profiles'}
						className={styles.desktopBrandButton}
						onClick={closeNav}
						aria-label={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
						title={profileId ? 'Open objects workspace' : 'Open profiles workspace'}
					>
						<BrandLockup subtitle="Local Dashboard" />
					</Link>
				</div>
				<AppNavigation
					api={api}
					meta={meta}
					selectedKey={selectedKey}
					shellScopeKey={shellScopeKey}
					onSelect={closeNav}
				/>
			</OverlaySheet>
		</Layout>
	)
}
