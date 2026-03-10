export const OBJECTS_DND_MIME = 'application/x-s3desk-dnd'

export type ObjectsDropIntent = 'internal_object_dnd' | 'external_upload' | 'none'

const dragTypes = (dt: DataTransfer | null): string[] => {
	if (!dt) return []
	return Array.from(dt.types ?? [])
}

export const hasInternalObjectsDndPayload = (dt: DataTransfer | null): boolean => {
	return dragTypes(dt).includes(OBJECTS_DND_MIME)
}

export const hasExternalUploadPayload = (dt: DataTransfer | null): boolean => {
	const types = dragTypes(dt)
	return types.includes('Files') && !types.includes(OBJECTS_DND_MIME)
}

export const resolveObjectsDropIntent = (dt: DataTransfer | null): ObjectsDropIntent => {
	if (hasInternalObjectsDndPayload(dt)) return 'internal_object_dnd'
	if (hasExternalUploadPayload(dt)) return 'external_upload'
	return 'none'
}
