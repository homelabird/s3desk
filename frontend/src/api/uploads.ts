export type UploadFileItem = {
	file: File
	relPath?: string
}

export type UploadCommitItem = {
	path: string
	size?: number
}

export type UploadCommitRequest = {
	label?: string
	rootName?: string
	rootKind?: 'file' | 'folder' | 'collection'
	totalFiles?: number
	totalBytes?: number
	items?: UploadCommitItem[]
	itemsTruncated?: boolean
}

export type UploadFilesResult = {
	skipped: number
}

export function resolveUploadFilename(item: UploadFileItem): string {
	const fileWithPath = item.file as File & { webkitRelativePath?: string; relativePath?: string }
	const relPath = (item.relPath ?? fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? '').trim()
	return relPath || item.file.name
}

export function createMultipartUploadFile(item: UploadFileItem): File {
	const filename = resolveUploadFilename(item)
	if (item.file.name === filename) return item.file
	return new File([item.file], filename, {
		type: item.file.type,
		lastModified: item.file.lastModified,
	})
}
