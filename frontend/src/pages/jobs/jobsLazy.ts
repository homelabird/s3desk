import { lazy } from 'react'

export const JobsOverlaysHost = lazy(async () => {
	const m = await import('./JobsOverlaysHost')
	return { default: m.JobsOverlaysHost }
})
