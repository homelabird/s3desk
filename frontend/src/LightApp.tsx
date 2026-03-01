import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { APIClient, APIError } from './api/client'
import { WelcomeScreen } from './components/WelcomeScreen'
import { useLocalStorageState } from './lib/useLocalStorageState'

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
		<div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>
			<div>Access blocked by server policy.</div>
			<div style={{ marginTop: 6 }}>On the server host: open the UI from the same machine (loopback).</div>
			<div style={{ marginTop: 6 }}>
				From another device: open the server&apos;s LAN IP (for example, 192.168.0.200) and verify <code>ALLOW_REMOTE=true</code>,{' '}
				<code>API_TOKEN</code>, and (if using a hostname) <code>ALLOWED_HOSTS</code>.
			</div>
		</div>
	)
}

function LightErrorCard(props: { title: string; hint?: ReactNode; onRetry?: () => void }) {
	return (
		<div style={{ width: 560, maxWidth: '100%' }}>
			<h1 style={{ margin: 0, fontSize: 28 }}>S3Desk</h1>
			<div style={{ marginTop: 4, opacity: 0.75 }}>Local Dashboard</div>

			<div style={{ height: 16 }} />

			<div style={{ border: '1px solid var(--s3d-color-border-secondary)', borderRadius: 'var(--s3d-radius-lg)', padding: 16, background: 'var(--s3d-color-bg)' }}>
				<div style={{ fontWeight: 700 }}>Backend connection failed</div>
				<div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>{props.title}</div>
				{props.hint ? <div>{props.hint}</div> : null}
				{props.onRetry ? (
					<div style={{ marginTop: 12 }}>
						<button
							type="button"
							onClick={props.onRetry}
							style={{
								border: '1px solid var(--s3d-color-border-input)',
								background: 'var(--s3d-color-bg)',
								borderRadius: 'var(--s3d-radius-md)',
								padding: '8px 12px',
								fontWeight: 600,
								cursor: 'pointer',
							}}
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
		? 'Saved API token is invalid. Please log in again with a valid token.'
		: 'This server requires an API token. Enter the backend API_TOKEN used to start the server.'

	const submit = async () => {
		const trimmed = token.trim()
		if (!trimmed || submitting) return
		setSubmitting(true)
		setError(null)
		try {
			const api = new APIClient({ apiToken: trimmed })
			await api.getMeta()
			props.onLogin(trimmed)
		} catch (err) {
			if (err instanceof APIError && err.status === 401) setError('Login failed: invalid API token.')
			else setError(formatApiErrorTitle(err))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div style={{ width: 560, maxWidth: '100%' }}>
			<h1 style={{ margin: 0, fontSize: 28 }}>S3Desk</h1>
			<div style={{ marginTop: 4, opacity: 0.75 }}>Local Dashboard</div>

			<div style={{ height: 16 }} />

			<div style={{ border: '1px solid var(--s3d-color-border-secondary)', borderRadius: 'var(--s3d-radius-lg)', padding: 16, background: 'var(--s3d-color-bg)' }}>
				<div
					style={{
						border: `1px solid ${showSavedTokenWarning ? 'var(--s3d-color-warning-border)' : 'var(--s3d-color-info-border)'}`,
						background: showSavedTokenWarning ? 'var(--s3d-color-warning-bg)' : 'var(--s3d-color-info-bg)',
						borderRadius: 'var(--s3d-radius-md)',
						padding: 12,
						fontSize: 13,
						lineHeight: 1.45,
					}}
				>
					{hint}
				</div>

				{error ? (
					<div
						role="alert"
						style={{
							marginTop: 12,
							border: '1px solid #fca5a5',
							background: 'var(--s3d-color-error-bg)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: 12,
							fontSize: 13,
						}}
					>
						{error}
					</div>
				) : null}

				<form
					onSubmit={(e) => {
						e.preventDefault()
						void submit()
					}}
					style={{ marginTop: 12 }}
				>
					<label htmlFor="api-token" style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>
						API Token
					</label>
					<input
						id="api-token"
						type="password"
						autoComplete="current-password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="API_TOKEN…"
						style={{
							marginTop: 6,
							width: '100%',
							border: '1px solid var(--s3d-color-border-input)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: '10px 12px',
							fontSize: 14,
						}}
					/>

					<div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
						<button
							type="submit"
							disabled={!token.trim() || submitting}
							style={{
								border: '1px solid var(--s3d-color-primary-btn)',
								background: submitting ? 'var(--s3d-color-info-border)' : '#1d4ed8',
								color: 'var(--s3d-color-bg)',
								borderRadius: 'var(--s3d-radius-md)',
								padding: '9px 12px',
								fontWeight: 700,
								cursor: submitting ? 'default' : 'pointer',
							}}
						>
							{submitting ? 'Logging in…' : 'Login'}
						</button>
						{props.onClearSavedToken ? (
							<button
								type="button"
								onClick={props.onClearSavedToken}
								disabled={submitting}
								style={{
									border: '1px solid var(--s3d-color-border-input)',
									background: 'var(--s3d-color-bg)',
									borderRadius: 'var(--s3d-radius-md)',
									padding: '9px 12px',
									fontWeight: 700,
									cursor: submitting ? 'default' : 'pointer',
								}}
							>
								Clear saved token
							</button>
						) : null}
					</div>
				</form>

				<div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
					This is not your S3 access key. It must match the server <code>API_TOKEN</code>.
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
	const navigate = useNavigate()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])

	const [reloadNonce, setReloadNonce] = useState(0)
	const [profilesState, setProfilesState] = useState<
		| { status: 'loading' }
		| { status: 'success'; data: LightProfile[] }
		| { status: 'error'; error: unknown }
	>({ status: 'loading' })

	useEffect(() => {
		let cancelled = false
		api
			.listProfiles()
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

	const profiles = profilesState.status === 'success' ? profilesState.data : []
	const hasProfiles = profiles.length > 0

	const openDashboard = (path: '/buckets' | '/objects' | '/uploads' | '/jobs') => {
		if (!props.profileId) return
		navigate(path)
	}

	return (
		<div style={{ width: 760, maxWidth: '100%' }}>
			<a className="skip-link" href="#main">
				Skip to content
			</a>

			<header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
				<div>
					<h1 style={{ margin: 0, fontSize: 28 }}>S3Desk</h1>
					<div style={{ marginTop: 4, opacity: 0.75 }}>Profiles</div>
				</div>
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<Link
						to="/profiles?create=1"
						style={{
							border: '1px solid var(--s3d-color-primary-btn)',
							background: 'var(--s3d-color-primary-btn)',
							color: 'var(--s3d-color-bg)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: '9px 12px',
							fontWeight: 700,
							textDecoration: 'none',
						}}
					>
						Create profile
					</Link>
					<Link
						to="/profiles?advanced=1"
						style={{
							border: '1px solid var(--s3d-color-border-input)',
							background: 'var(--s3d-color-bg)',
							color: 'var(--s3d-color-text-dark)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: '9px 12px',
							fontWeight: 700,
							textDecoration: 'none',
						}}
					>
						Advanced
					</Link>
					<Link
						to="/profiles?settings=1"
						style={{
							border: '1px solid var(--s3d-color-border-input)',
							background: 'var(--s3d-color-bg)',
							color: 'var(--s3d-color-text-dark)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: '9px 12px',
							fontWeight: 700,
							textDecoration: 'none',
						}}
					>
						Settings
					</Link>
				</div>
			</header>

			<div style={{ height: 12 }} />

			<main id="main">
				<section style={{ border: '1px solid var(--s3d-color-border-secondary)', borderRadius: 'var(--s3d-radius-lg)', background: 'var(--s3d-color-bg)', overflow: 'hidden' }}>
					<div style={{ padding: 14, borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
						<div style={{ fontWeight: 800 }}>Choose a profile</div>
						{props.profileId ? (
							<div style={{ fontSize: 13, opacity: 0.8 }}>
								Selected: <code>{props.profileId}</code>
							</div>
						) : (
							<div style={{ fontSize: 13, opacity: 0.8 }}>No profile selected</div>
						)}
					</div>

					{profilesState.status === 'loading' ? (
						<div role="status" style={{ padding: 14, fontSize: 13, opacity: 0.8 }}>Loading profiles…</div>
					) : profilesState.status === 'error' ? (
						<div style={{ padding: 14, fontSize: 13 }}>
							<div>
								Failed to load profiles: <span style={{ opacity: 0.85 }}>{formatApiErrorTitle(profilesState.error)}</span>
							</div>
							<div style={{ marginTop: 10 }}>
								<button
									type="button"
									onClick={() => {
										setProfilesState({ status: 'loading' })
										setReloadNonce((v) => v + 1)
									}}
									style={{
										border: '1px solid var(--s3d-color-border-input)',
										background: 'var(--s3d-color-bg)',
										borderRadius: 'var(--s3d-radius-md)',
										padding: '8px 12px',
										fontWeight: 700,
										cursor: 'pointer',
									}}
								>
									Retry
								</button>
							</div>
						</div>
					) : !hasProfiles ? (
						<div style={{ padding: 14 }}>
							<WelcomeScreen onGetStarted={() => navigate('/profiles?create=1')} />
						</div>
					) : (
						<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
							{profiles.map((p) => {
								const selected = p.id === props.profileId
								const subtitleParts = [p.provider, p.region, p.endpoint].filter(Boolean)
								const subtitle = subtitleParts.join(' · ')
								return (
									<li key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
										<button
											type="button"
											onClick={() => props.setProfileId(p.id)}
											style={{
												width: '100%',
												textAlign: 'left',
												padding: '12px 14px',
												border: 'none',
												background: selected ? 'var(--s3d-color-info-bg)' : 'var(--s3d-color-bg)',
												cursor: 'pointer',
											}}
											aria-pressed={selected}
										>
											<div style={{ fontWeight: 800 }}>{p.name || p.id}</div>
											{subtitle ? <div style={{ marginTop: 3, fontSize: 12, opacity: 0.75 }}>{subtitle}</div> : null}
											<div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
												<code>{p.id}</code>
												{selected ? <span style={{ marginLeft: 8, fontWeight: 800 }}>(selected)</span> : null}
											</div>
										</button>
									</li>
								)
							})}
						</ul>
					)}
				</section>

				<div style={{ height: 12 }} />

				<section style={{ border: '1px solid var(--s3d-color-border-secondary)', borderRadius: 'var(--s3d-radius-lg)', padding: 14, background: 'var(--s3d-color-bg)' }}>
					<div style={{ fontWeight: 800 }}>Open</div>
					<div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
						{(['/buckets', '/objects', '/uploads', '/jobs'] as const).map((path) => (
							<button
								key={path}
								type="button"
								onClick={() => openDashboard(path)}
								disabled={!props.profileId}
								style={{
									border: '1px solid var(--s3d-color-border-input)',
									background: props.profileId ? '#fff' : '#f8fafc',
									borderRadius: 'var(--s3d-radius-md)',
									padding: '9px 12px',
									fontWeight: 700,
									cursor: props.profileId ? 'pointer' : 'not-allowed',
									opacity: props.profileId ? 1 : 0.65,
								}}
							>
								{path.slice(1)}
							</button>
						))}
					</div>
					{props.profileId ? null : (
						<div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>Select a profile first to open the dashboard.</div>
					)}
				</section>
			</main>
		</div>
	)
}

export default function LightApp() {
	const [apiToken, setApiToken] = useLocalStorageState('apiToken', '')
	const [profileId, setProfileId] = useLocalStorageState<string | null>('profileId', null)

	const api = useMemo(() => new APIClient({ apiToken }), [apiToken])
	const [metaReloadNonce, setMetaReloadNonce] = useState(0)
	const [metaState, setMetaState] = useState<
		| { status: 'loading' }
		| { status: 'success' }
		| { status: 'error'; error: unknown }
	>({ status: 'loading' })

	useEffect(() => {
		let cancelled = false
		api
			.getMeta()
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

	if (metaState.status === 'loading') {
		return (
			<div role="status" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
				<div style={{ width: 520, maxWidth: '100%', textAlign: 'center' }}>
					<div style={{ fontSize: 18, fontWeight: 700 }}>Loading…</div>
					<div style={{ marginTop: 8, opacity: 0.75 }}>Connecting to the backend.</div>
				</div>
			</div>
		)
	}

	if (metaState.status === 'error') {
		const err = metaState.error
		const isUnauthorized = err instanceof APIError && err.status === 401
		if (isUnauthorized) {
			return (
				<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
					<LightLogin
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
			<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
				<LightErrorCard title={title} hint={hint} onRetry={retryMeta} />
			</div>
		)
	}

	return (
		<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--s3d-color-bg-page)' }}>
			<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
				{apiToken ? (
					<button
						type="button"
						onClick={() => {
							applyApiToken('')
							setProfileId(null)
						}}
						style={{
							border: '1px solid var(--s3d-color-border-input)',
							background: 'var(--s3d-color-bg)',
							borderRadius: 'var(--s3d-radius-md)',
							padding: '8px 12px',
							fontWeight: 700,
							cursor: 'pointer',
						}}
					>
						Logout
					</button>
				) : null}
			</div>
			<ProfilesList apiToken={apiToken} profileId={profileId} setProfileId={setProfileId} />
		</div>
	)
}
