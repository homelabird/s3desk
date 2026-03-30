import { Suspense, lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { readLegacyActiveProfileIdForMigration, serverScopedStorageKey } from './lib/profileScopedStorage'
import styles from './App.module.css'
import LightApp from './LightApp'

const FullApp = lazy(async () => {
	const m = await import('./FullApp')
	return { default: m.default }
})

function LoadingScreen() {
	return (
		<div role="status" className={styles.loadingScreen}>
			<div className={styles.loadingPanel}>
				<div className={styles.loadingTitle}>Loading…</div>
				<div className={styles.loadingCopy}>Preparing the dashboard UI.</div>
			</div>
		</div>
	)
}

function readStoredString(storage: Storage, key: string): string | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return typeof parsed === 'string' && parsed.trim() ? parsed : null
	} catch {
		return null
	}
}

function readStoredApiToken(): string {
	if (typeof window === 'undefined') return ''
	return readStoredString(window.sessionStorage, 'apiToken') ?? readStoredString(window.localStorage, 'apiToken') ?? ''
}

function readStoredProfileId(apiToken: string): string | null {
	if (typeof window === 'undefined') return null
	return (
		readStoredString(window.localStorage, serverScopedStorageKey('app', apiToken, 'profileId')) ??
		readLegacyActiveProfileIdForMigration(apiToken)
	)
}

export default function App() {
	const location = useLocation()

	if (location.pathname === '/') {
		const apiToken = readStoredApiToken()
		return <Navigate to={readStoredProfileId(apiToken) ? '/objects' : '/setup'} replace />
	}

	// Keep setup/auth/profile-selection lightweight and separate from the full dashboard shell.
	if (location.pathname === '/setup') {
		return <LightApp />
	}

	return (
		<Suspense fallback={<LoadingScreen />}>
			<FullApp />
		</Suspense>
	)
}
