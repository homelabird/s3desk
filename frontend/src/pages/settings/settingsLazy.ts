import { lazy } from 'react'

export const AccessSettingsSection = lazy(async () => {
	const m = await import('./AccessSettingsSection')
	return { default: m.AccessSettingsSection }
})

export const TransfersSettingsSection = lazy(async () => {
	const m = await import('./TransfersSettingsSection')
	return { default: m.TransfersSettingsSection }
})

export const ObjectsSettingsSection = lazy(async () => {
	const m = await import('./ObjectsSettingsSection')
	return { default: m.ObjectsSettingsSection }
})

export const NetworkSettingsSection = lazy(async () => {
	const m = await import('./NetworkSettingsSection')
	return { default: m.NetworkSettingsSection }
})

export const ServerSettingsSection = lazy(async () => {
	const m = await import('./ServerSettingsSection')
	return { default: m.ServerSettingsSection }
})
