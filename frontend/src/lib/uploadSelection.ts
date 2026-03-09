type UploadFileWithPath = File & { webkitRelativePath?: string; relativePath?: string }

export type UploadSelectionKind = 'empty' | 'files' | 'folder' | 'collection'

export function getUploadSelectionPath(file: File): string {
	const fileWithPath = file as UploadFileWithPath
	const raw = (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim()
	return raw || file.name
}

export function inferUploadSelectionKind(files: File[]): UploadSelectionKind {
	if (files.length === 0) return 'empty'
	const paths = files.map(getUploadSelectionPath)
	const hasNestedPath = paths.some((path) => path.includes('/'))
	if (!hasNestedPath) return 'files'

	const roots = new Set(
		paths
			.map((path) => path.split('/').filter(Boolean)[0])
			.filter((value): value is string => !!value),
	)
	return roots.size <= 1 ? 'folder' : 'collection'
}

export function describeUploadSelection(files: File[]): { kind: UploadSelectionKind; rootName?: string } {
	const kind = inferUploadSelectionKind(files)
	if (kind === 'folder') {
		const rootName = getUploadSelectionPath(files[0] ?? new File([], '')).split('/').filter(Boolean)[0]
		return { kind, rootName: rootName || undefined }
	}
	return { kind }
}
