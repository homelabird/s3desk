import { Suspense, lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

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

function readStoredProfileId(): string | null {
	if (typeof window === 'undefined') return null
	try {
		const raw = window.localStorage.getItem('profileId')
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return typeof parsed === 'string' && parsed.trim() ? parsed : null
	} catch {
		return null
	}
}

export default function App() {
	const location = useLocation()

	if (location.pathname === '/') {
		return <Navigate to={readStoredProfileId() ? '/objects' : '/setup'} replace />
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
