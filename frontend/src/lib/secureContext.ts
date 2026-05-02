export const localhostBasedOriginRequirement = 'HTTPS or a localhost-based origin'

export function directoryPickerInsecureOriginReason(): string {
	return `Directory picker requires ${localhostBasedOriginRequirement}.`
}

export function directoryPickerEnvironmentUnavailableReason(): string {
	return 'Directory picker is not available in this environment.'
}

export function directoryPickerUnsupportedBrowserReason(): string {
	return 'Directory picker is not supported in this browser.'
}

export function directoryPickerUnavailableHint(): string {
	return 'Directory picker is not available.'
}

export function directorySelectionUnavailableHint(): string {
	return 'This browser only supports file selection.'
}

export function uploadFromDeviceTitle(): string {
	return 'Upload from this device'
}

export function folderSelectionUnavailableTitle(): string {
	return 'Folder selection is unavailable'
}

export function folderSelectionPreservesNestedPathsHint(): string {
	return 'Use folder selection to include nested relative paths.'
}

export function clipboardInsecureOriginHint(): string {
	return `Copy failed. Clipboard access is restricted on insecure origins (try ${localhostBasedOriginRequirement}).`
}

export function localDeviceAccessBrowserHint(): string {
	return `Use ${localhostBasedOriginRequirement} in a supported browser.`
}

export function localFolderAccessUnavailableTitle(): string {
	return 'Local folder access is not available'
}

export function selectLocalFolderFirstHint(): string {
	return 'Select a local folder first'
}

export function localFolderSelectionFailedHint(): string {
	return 'Failed to select a local folder.'
}

export function localFolderWritePermissionDeniedHint(): string {
	return 'Permission to write to the selected folder was denied.'
}

export function noObjectsFoundUnderPrefixHint(): string {
	return 'No objects found under this prefix'
}

export function noFilesFoundInSelectedFolderHint(): string {
	return 'No files found in the selected folder'
}
