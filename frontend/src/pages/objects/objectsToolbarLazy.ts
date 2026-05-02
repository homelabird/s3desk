import { lazy } from 'react'

export const ObjectsToolbarSection = lazy(async () => {
	const m = await import('./ObjectsToolbarSection')
	return { default: m.ObjectsToolbarSection }
})
