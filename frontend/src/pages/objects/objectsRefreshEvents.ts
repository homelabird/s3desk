import { normalizePrefix } from './objectsListUtils'

export const objectsRefreshEventName = 's3desk:objects-refresh'

export type ObjectsRefreshEventDetail = {
	profileId: string
	bucket: string
	prefix: string
	source: 'upload' | 'delete_prefix' | 'delete_objects'
}

type ActiveObjectsLocation = {
	profileId: string
	bucket: string
	prefix: string
}

export function publishObjectsRefresh(detail: ObjectsRefreshEventDetail) {
	if (typeof window === 'undefined') return
	window.dispatchEvent(
		new CustomEvent<ObjectsRefreshEventDetail>(objectsRefreshEventName, {
			detail: {
				...detail,
				prefix: normalizePrefix(detail.prefix),
			},
		}),
	)
}

export function isObjectsRefreshRelevant(active: ActiveObjectsLocation, detail: ObjectsRefreshEventDetail): boolean {
	if (active.profileId !== detail.profileId) return false
	if (active.bucket !== detail.bucket) return false

	const activePrefix = normalizePrefix(active.prefix)
	const changedPrefix = normalizePrefix(detail.prefix)
	if (!activePrefix) return true
	return changedPrefix.startsWith(activePrefix)
}
