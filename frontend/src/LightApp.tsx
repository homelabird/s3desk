import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { APIError } from './api/client'
import { createLightAPIClient } from './api/lightClient'
import { useAuth } from './auth/useAuth'
import { BrandLockup } from './components/BrandLockup'
import { clearPersistedTransfersStorage } from './components/transfers/useTransfersPersistence'
import styles from './LightApp.module.css'
import { WelcomeScreen } from './components/WelcomeScreen'
import {
	readLegacyActiveProfileIdForMigration,
	serverScopedStorageKey,
	shouldUseLegacyActiveProfileStorageMigration,
} from './lib/profileScopedStorage'
import { useLocalStorageState } from './lib/useLocalStorageState'
import { useThemeMode } from './useThemeMode'

type LightProfile = {
	id: string
	name: string
	provider?: string
	endpoint?: string
	region?: string
	updatedAt?: string
}

function formatApiErrorTitle(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'Unknown error'
}

function LightHint403() {
	return (
		<div className={styles.hint403}>
			<div>Access blocked by server policy.</div>
			<div className={styles.rowGap6}>On the server host: open the UI from the same machine (loopback).</div>
			<div className={styles.rowGap6}>
				From another device: open the server&apos;s LAN IP (for example, 192.168.0.200) and verify <code>ALLOW_REMOTE=true</code>,{' '}
				<code>API_TOKEN</code>, and (if using a hostname) <code>ALLOWED_HOSTS</code>.
			</div>
		</div>
	)
}

function LightErrorCard(props: { title: string; hint?: ReactNode; onRetry?: () => void }) {
		return (
			<div className={styles.panelSmall}>
				<BrandLockup titleAs="h1" subtitle="Setup" variant="hero" />

				<div className={styles.spacer16} />

			<div className={styles.card}>
				<div className={styles.cardTitle}>Backend connection failed</div>
				<div className={`${styles.rowGap8} ${styles.bodyText}`}>{props.title}</div>
				{props.hint ? <div>{props.hint}</div> : null}
				{props.onRetry ? (
					<div className={styles.rowGap12}>
						<button
							type="button"
							onClick={props.onRetry}
							className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonClickable}`}
						>
							Retry
						</button>
					</div>
				) : null}
			</div>
		</div>
	)
}

function LightLogin(props: { initialToken: string; onLogin: (token: string) => void; onClearSavedToken?: () => void }) {
	const [token, setToken] = useState(props.initialToken ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const showSavedTokenWarning = !!props.initialToken
	const hint = showSavedTokenWarning
		? 'Stored API token for this browser session is invalid. Please log in again with a valid token.'
		: 'This server requires an API token. Enter the backend API_TOKEN used to start the server.'

	const submit = async () => {
		const trimmed = token.trim()
		if (!trimmed || submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const api = createLightAPIClient({ apiToken: trimmed })
			await api.server.getMeta()
			props.onLogin(trimmed)
		} catch (err) {
			if (err instanceof APIError && err.status === 401) setError('Login failed: invalid API token.')
			else setError(formatApiErrorTitle(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className={styles.panelSmall}>
			<BrandLockup titleAs="h1" subtitle="Setup" variant="hero" />

			<div className={styles.spacer16} />

			<div className={styles.card}>
				<div className={`${styles.statusCard} ${showSavedTokenWarning ? styles.statusWarning : styles.statusInfo}`}>{hint}</div>

				{error ? (
					<div role="alert" className={`${styles.rowGap12} ${styles.statusCard} ${styles.statusError}`}>
						{error}
					</div>
				) : null}

				<form
					onSubmit={(e) => {
						e.preventDefault()
						void submit()
					}}
					className={styles.rowGap12}
				>
					<label htmlFor="api-token" className={styles.label}>
						API Token
					</label>
					<input
						id="api-token"
						type="password"
						autoComplete="current-password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="API_TOKEN…"
						className={styles.tokenInput}
					/>

					<div className={styles.buttonRow}>
						<button
							type="submit"
							disabled={!token.trim() || submitting}
							className={`${styles.button} ${styles.buttonPrimary} ${submitting ? styles.buttonPrimaryDisabled : styles.buttonClickable}`}
						>
							{submitting ? 'Logging in…' : 'Login'}
						</button>
						{props.onClearSavedToken ? (
							<button
								type="button"
								onClick={props.onClearSavedToken}
								disabled={submitting}
								className={`${styles.button} ${styles.buttonSecondary} ${submitting ? styles.buttonSecondaryDisabled : styles.buttonClickable}`}
							>
								Clear stored token
							</button>
						) : null}
					</div>
				</form>

				<div className={`${styles.rowGap12} ${styles.metaText}`}>
					This is not your S3 access key. It must match the server <code>API_TOKEN</code> and is stored only for this browser session.
				</div>
			</div>
		</div>
	)
}

function ProfilesList(props: {
	apiToken: string
	profileId: string | null
	setProfileId: (v: string | null) => void
}) {
	const { apiToken, profileId, setProfileId } = props
	const navigate = useNavigate()
	const api = useMemo(() => createLightAPIClient({ apiToken }), [apiToken])

	const [reloadNonce, setReloadNonce] = useState(0)
	const [profilesState, setProfilesState] = useState<
		| { status: 'loading' }
		| { status: 'success'; data: LightProfile[] }
		| { status: 'error'; error: unknown }
	>({ status: 'loading' })

	useEffect(() => {
		let cancelled = false
		api
			.profiles.listProfiles()
			.then((data) => {
				if (cancelled) return
				setProfilesState({ status: 'success', data: data as LightProfile[] })
			})
			.catch((err) => {
				if (cancelled) return
				setProfilesState({ status: 'error', error: err })
			})
		return () => {
			cancelled = true
		}
	}, [api, reloadNonce])

	const successfulProfiles = profilesState.status === 'success' ? profilesState.data : null
	const profiles = successfulProfiles ?? []
	const hasProfiles = profiles.length > 0
	const effectiveProfileId = profilesState.status === 'success' && profileId && profiles.some((profile) => profile.id === profileId) ? profileId : null

	useEffect(() => {
		if (!successfulProfiles) return
		if (profileId === null) return
		if (successfulProfiles.some((profile) => profile.id === profileId)) return
		setProfileId(null)
	}, [profileId, setProfileId, successfulProfiles])

	const openDashboard = (path: '/buckets' | '/objects' | '/uploads' | '/jobs') => {
		if (!effectiveProfileId) return
		navigate(path)
	}

	return (
		<div className={styles.panelLarge}>
			<a className="skip-link" href="#main">
				Skip to content
			</a>

			<header className={styles.header}>
				<BrandLockup titleAs="h1" subtitle="Setup" variant="hero" />
				<div className={styles.headerActions}>
					<Link to="/profiles?create=1" className={`${styles.linkButton} ${styles.linkButtonPrimary}`}>
						Create profile
					</Link>
					<Link to="/profiles?advanced=1" className={`${styles.linkButton} ${styles.linkButtonSecondary}`}>
						Advanced
					</Link>
					<Link to="/profiles?settings=1" className={`${styles.linkButton} ${styles.linkButtonSecondary}`}>
						Settings
					</Link>
				</div>
			</header>

			<div className={styles.spacer12} />

			<main id="main">
				<section className={`${styles.section} ${styles.sectionOverflowHidden}`}>
					<div className={styles.sectionHeader}>
						<div className={styles.sectionHeading}>Choose a profile</div>
						{effectiveProfileId ? (
							<div className={styles.sectionSubtle}>
								Selected: <code>{effectiveProfileId}</code>
							</div>
						) : (
							<div className={styles.sectionSubtle}>No profile selected</div>
						)}
					</div>

					{profilesState.status === 'loading' ? (
						<div role="status" className={styles.statusLine}>Loading profiles…</div>
					) : profilesState.status === 'error' ? (
						<div className={styles.sectionBody}>
							<div>
								Failed to load profiles: <span className={styles.sectionSubtle}>{formatApiErrorTitle(profilesState.error)}</span>
							</div>
							<div className={styles.rowGap10}>
								<button
									type="button"
									onClick={() => {
										setProfilesState({ status: 'loading' })
										setReloadNonce((v) => v + 1)
									}}
									className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonClickable}`}
								>
									Retry
								</button>
							</div>
						</div>
					) : !hasProfiles ? (
						<div className={styles.sectionBody}>
							<WelcomeScreen onGetStarted={() => navigate('/profiles?create=1')} />
						</div>
					) : (
						<ul className={styles.profileList}>
							{profiles.map((p) => {
								const selected = p.id === effectiveProfileId
								const subtitleParts = [p.provider, p.region, p.endpoint].filter(Boolean)
								const subtitle = subtitleParts.join(' · ')
								return (
									<li key={p.id} className={styles.profileItem}>
										<button
											type="button"
											onClick={() => setProfileId(p.id)}
											className={`${styles.profileButton} ${selected ? styles.profileButtonSelected : ''}`}
											aria-pressed={selected}
										>
											<div className={styles.profileName}>{p.name || p.id}</div>
											{subtitle ? <div className={styles.profileSubtitle}>{subtitle}</div> : null}
											<div className={styles.profileMeta}>
												<code>{p.id}</code>
												{selected ? <span className={styles.profileSelectedMark}>(selected)</span> : null}
											</div>
										</button>
									</li>
								)
							})}
						</ul>
					)}
				</section>

				<div className={styles.spacer12} />

				<section className={`${styles.section} ${styles.sectionPadded}`}>
					<div className={styles.sectionHeading}>Open</div>
					<div className={styles.openButtons}>
						{(['/buckets', '/objects', '/uploads', '/jobs'] as const).map((path) => (
							<button
								key={path}
								type="button"
								onClick={() => openDashboard(path)}
								disabled={!effectiveProfileId}
								className={`${styles.button} ${styles.buttonSecondary} ${effectiveProfileId ? styles.buttonClickable : styles.openButtonDisabled}`}
							>
								{path.slice(1)}
							</button>
						))}
					</div>
					{effectiveProfileId ? null : <div className={styles.openHint}>Select a profile first to open the dashboard.</div>}
				</section>
			</main>
		</div>
	)
}

export default function LightApp() {
	const { apiToken, setApiToken } = useAuth()
	const profileStorageKey = useMemo(() => serverScopedStorageKey('app', apiToken, 'profileId'), [apiToken])
	const initialStoredProfileId = useMemo(() => readLegacyActiveProfileIdForMigration(apiToken), [apiToken])
	const legacyActiveProfileStorageKey = useMemo(
		() => (shouldUseLegacyActiveProfileStorageMigration(apiToken) ? 'profileId' : undefined),
		[apiToken],
	)
	const [profileId, setProfileId] = useLocalStorageState<string | null>(profileStorageKey, initialStoredProfileId, {
		legacyLocalStorageKey: legacyActiveProfileStorageKey,
	})
	const previousApiTokenRef = useRef<string | null | undefined>(undefined)
	const { mode, toggleMode } = useThemeMode()

	const api = useMemo(() => createLightAPIClient({ apiToken }), [apiToken])
	const [metaReloadNonce, setMetaReloadNonce] = useState(0)
	const [metaState, setMetaState] = useState<
		| { status: 'loading' }
		| { status: 'success' }
		| { status: 'error'; error: unknown }
	>({ status: 'loading' })

	useEffect(() => {
		if (previousApiTokenRef.current === undefined) {
			previousApiTokenRef.current = apiToken
			return
		}
		if (previousApiTokenRef.current === apiToken) return
		previousApiTokenRef.current = apiToken
		clearPersistedTransfersStorage()
	}, [apiToken])

	useEffect(() => {
		let cancelled = false
		api
			.server.getMeta()
			.then(() => {
				if (cancelled) return
				setMetaState({ status: 'success' })
			})
			.catch((err) => {
				if (cancelled) return
				setMetaState({ status: 'error', error: err })
			})
		return () => {
			cancelled = true
		}
	}, [api, metaReloadNonce])

	const retryMeta = () => {
		setMetaState({ status: 'loading' })
		setMetaReloadNonce((v) => v + 1)
	}

	const applyApiToken = (nextToken: string) => {
		setMetaState({ status: 'loading' })
		setApiToken(nextToken)
	}
	const themeLabel = `Theme: ${mode === 'dark' ? 'Dark' : 'Light'}`
	const themeAriaLabel = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
	const themeToggleButton = (
		<button
			type="button"
			onClick={toggleMode}
			aria-label={themeAriaLabel}
			className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonClickable}`}
		>
			{themeLabel}
		</button>
	)

	if (metaState.status === 'loading') {
		return (
			<div role="status" className={styles.centerShell}>
				<div className={styles.topRightActions}>{themeToggleButton}</div>
				<div className={styles.loadingCard}>
					<div className={styles.loadingTitle}>Loading…</div>
					<div className={styles.loadingSubtitle}>Connecting to the backend.</div>
				</div>
			</div>
		)
	}

	if (metaState.status === 'error') {
		const err = metaState.error
		const isUnauthorized = err instanceof APIError && err.status === 401
		if (isUnauthorized) {
			return (
				<div className={styles.centerShell}>
					<div className={styles.topRightActions}>{themeToggleButton}</div>
					<LightLogin
						key={apiToken || 'empty'}
						initialToken={apiToken}
						onLogin={(token) => applyApiToken(token)}
						onClearSavedToken={() => applyApiToken('')}
					/>
				</div>
			)
		}

		const title = formatApiErrorTitle(err)
		const hint = err instanceof APIError && err.status === 403 ? <LightHint403 /> : undefined
		return (
			<div className={styles.centerShell}>
				<div className={styles.topRightActions}>{themeToggleButton}</div>
				<LightErrorCard title={title} hint={hint} onRetry={retryMeta} />
			</div>
		)
	}

	return (
		<div className={`${styles.centerShell} ${styles.centerShellPage}`}>
			<div className={styles.topRightActions}>
				{themeToggleButton}
				{apiToken ? (
					<button
						type="button"
						onClick={() => {
							applyApiToken('')
							setProfileId(null)
						}}
						className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonClickable}`}
					>
						Logout
					</button>
				) : null}
			</div>
			<ProfilesList apiToken={apiToken} profileId={profileId} setProfileId={setProfileId} />
		</div>
	)
}
