export type UploadPreviewFile = {
	name: string
	size: number
}

type DirectoryFileInput = HTMLInputElement & { webkitdirectory?: boolean }

export function setDirectorySelectionMode(input: HTMLInputElement | null, enabled: boolean) {
	if (!input) return
	const dirInput = input as DirectoryFileInput
	if (enabled) {
		dirInput.webkitdirectory = true
		input.setAttribute('webkitdirectory', '')
	} else {
		dirInput.webkitdirectory = false
		input.removeAttribute('webkitdirectory')
	}
}

export function clearSelectedFileInput(input: HTMLInputElement | null) {
	if (!input) return
	input.value = ''
}

export function getSelectedFiles(input: HTMLInputElement | null): File[] {
	if (!input?.files) return []
	return Array.from(input.files)
}

export function getRelativePathLabel(file: File): string {
	const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
	return (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim() || file.name
}

export function buildUploadPreviewFiles(files: File[], limit = 6): UploadPreviewFile[] {
	return files.slice(0, limit).map((file) => ({
		name: getRelativePathLabel(file),
		size: file.size ?? 0,
	}))
}
