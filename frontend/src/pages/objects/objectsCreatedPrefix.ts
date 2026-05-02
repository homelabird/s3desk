import { normalizePrefix } from './objectsListUtils'

export function getVisibleCreatedPrefix(parentPrefix: string, createdKey: string): string {
	const parent = normalizePrefix(parentPrefix)
	const created = normalizePrefix(createdKey)
	if (!created) return ''
	if (!parent || !created.startsWith(parent)) {
		const parts = created.split('/').filter(Boolean)
		return parts.length > 0 ? `${parts[0]}/` : created
	}

	const remainder = created.slice(parent.length)
	const firstSegment = remainder.split('/').filter(Boolean)[0]
	if (!firstSegment) return created
	return `${parent}${firstSegment}/`
}
