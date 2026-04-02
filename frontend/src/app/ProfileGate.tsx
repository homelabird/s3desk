import { Navigate } from 'react-router-dom'

export function renderProfileGate(args: { pathname: string; profileId: string | null }) {
	const { pathname, profileId } = args
	if (profileId) {
		return null
	}
	if (pathname.startsWith('/profiles')) {
		return null
	}
	return <Navigate to="/setup" replace />
}
