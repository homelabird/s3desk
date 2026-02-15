export type JobsUploadDetailItem = {
	path: string
	key: string
	size?: number
}

export type JobsUploadDetails = {
	uploadId?: string
	bucket?: string
	prefix?: string
	label?: string
	rootName?: string
	rootKind?: 'file' | 'folder' | 'collection'
	totalFiles?: number
	totalBytes?: number
	items: JobsUploadDetailItem[]
	itemsTruncated?: boolean
}

export type JobsUploadTableRow = {
	key: string
	path: string
	size?: number
	etag: string | null
}
