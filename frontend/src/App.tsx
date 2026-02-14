import { Suspense, lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import LightApp from './LightApp'

const FullApp = lazy(async () => {
	const m = await import('./FullApp')
	return { default: m.default }
})

function LoadingScreen() {
	return (
		<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
			<div style={{ width: 520, maxWidth: '100%', textAlign: 'center' }}>
				<div style={{ fontSize: 18, fontWeight: 600 }}>Loading…</div>
				<div style={{ marginTop: 8, opacity: 0.75 }}>Preparing the dashboard UI.</div>
			</div>
		</div>
	)
}

export default function App() {
	const location = useLocation()

	if (location.pathname === '/') {
		return <Navigate to="/profiles" replace />
	}

	// Keep /profiles (no query params) lightweight: avoid loading antd/rc UI until needed.
	const shouldUseLightShell = location.pathname === '/profiles' && location.search === ''
	if (shouldUseLightShell) {
		return <LightApp />
	}

	return (
		<Suspense fallback={<LoadingScreen />}>
			<FullApp />
		</Suspense>
	)
}
