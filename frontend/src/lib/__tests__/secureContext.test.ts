import { describe, expect, it } from 'vitest'

import {
	clipboardInsecureOriginHint,
	directoryPickerEnvironmentUnavailableReason,
	directorySelectionUnavailableHint,
	directoryPickerInsecureOriginReason,
	directoryPickerUnavailableHint,
	directoryPickerUnsupportedBrowserReason,
	folderSelectionPreservesNestedPathsHint,
	folderSelectionUnavailableTitle,
	localFolderAccessUnavailableTitle,
	localFolderSelectionFailedHint,
	localFolderWritePermissionDeniedHint,
	localDeviceAccessBrowserHint,
	localhostBasedOriginRequirement,
	noFilesFoundInSelectedFolderHint,
	noObjectsFoundUnderPrefixHint,
	selectLocalFolderFirstHint,
	uploadFromDeviceTitle,
} from '../secureContext'

describe('secureContext helpers', () => {
	it('keeps the shared localhost-based origin requirement wording centralized', () => {
		expect(localhostBasedOriginRequirement).toBe('HTTPS or a localhost-based origin')
	})

	it('builds the directory picker insecure-origin reason from the shared wording', () => {
		expect(directoryPickerInsecureOriginReason()).toBe('Directory picker requires HTTPS or a localhost-based origin.')
	})

	it('builds the directory picker environment-unavailable reason from the shared wording module', () => {
		expect(directoryPickerEnvironmentUnavailableReason()).toBe('Directory picker is not available in this environment.')
	})

	it('builds the directory picker unsupported-browser reason from the shared wording module', () => {
		expect(directoryPickerUnsupportedBrowserReason()).toBe('Directory picker is not supported in this browser.')
	})

	it('builds the generic directory picker unavailable hint from the shared wording module', () => {
		expect(directoryPickerUnavailableHint()).toBe('Directory picker is not available.')
	})

	it('builds the directory-selection unavailable hint from the shared wording module', () => {
		expect(directorySelectionUnavailableHint()).toBe('This browser only supports file selection.')
	})

	it('builds the upload-from-device title from the shared wording module', () => {
		expect(uploadFromDeviceTitle()).toBe('Upload from this device')
	})

	it('builds the folder-selection unavailable title from the shared wording module', () => {
		expect(folderSelectionUnavailableTitle()).toBe('Folder selection is unavailable')
	})

	it('builds the folder-selection nested-path hint from the shared wording module', () => {
		expect(folderSelectionPreservesNestedPathsHint()).toBe('Use folder selection to include nested relative paths.')
	})

	it('builds the clipboard insecure-origin hint from the shared wording', () => {
		expect(clipboardInsecureOriginHint()).toBe(
			'Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or a localhost-based origin).',
		)
	})

	it('builds the local device access browser hint from the shared wording', () => {
		expect(localDeviceAccessBrowserHint()).toBe('Use HTTPS or a localhost-based origin in a supported browser.')
	})

	it('builds the local-folder access unavailable title from the shared wording module', () => {
		expect(localFolderAccessUnavailableTitle()).toBe('Local folder access is not available')
	})

	it('builds the local-folder required hint from the shared wording module', () => {
		expect(selectLocalFolderFirstHint()).toBe('Select a local folder first')
	})

	it('builds the local-folder selection failure hint from the shared wording module', () => {
		expect(localFolderSelectionFailedHint()).toBe('Failed to select a local folder.')
	})

	it('builds the local-folder write-permission denied hint from the shared wording module', () => {
		expect(localFolderWritePermissionDeniedHint()).toBe('Permission to write to the selected folder was denied.')
	})

	it('builds the empty-prefix download hint from the shared wording module', () => {
		expect(noObjectsFoundUnderPrefixHint()).toBe('No objects found under this prefix')
	})

	it('builds the empty-folder upload hint from the shared wording module', () => {
		expect(noFilesFoundInSelectedFolderHint()).toBe('No files found in the selected folder')
	})
})
