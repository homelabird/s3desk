export type ObjectPreview = {
	key: string
	status: 'loading' | 'ready' | 'error' | 'unsupported' | 'blocked'
	kind: 'image' | 'video' | 'text' | 'json' | 'unsupported'
	contentType: string | null
	url?: string
	text?: string
	truncated?: boolean
	error?: string
}

export type ObjectSort = 'name_asc' | 'name_desc' | 'size_asc' | 'size_desc' | 'time_asc' | 'time_desc'

export type ObjectTypeFilter = 'all' | 'folders' | 'files'

export type ObjectsViewMode = 'list' | 'grid'
