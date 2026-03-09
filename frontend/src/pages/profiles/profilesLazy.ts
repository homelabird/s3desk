import { lazy } from 'react'

export const ProfilesModals = lazy(async () => {
	const m = await import('./ProfilesModals')
	return { default: m.ProfilesModals }
})
