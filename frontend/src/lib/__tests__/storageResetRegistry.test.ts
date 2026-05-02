import { afterEach, describe, expect, it } from 'vitest'

import {
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
} from '../../components/transfers/transferConcurrencyPreferences'
import { serverScopedStorageKey } from '../profileScopedStorage'
import { clearResettableUiState } from '../storageResetRegistry'

afterEach(() => {
	window.localStorage.clear()
})

describe('clearResettableUiState', () => {
	it('clears registered UI keys and scoped UI prefixes while keeping unrelated secrets', () => {
		window.localStorage.setItem('apiToken', 'keep-token')
		window.localStorage.setItem('downloadLinkProxyEnabled', 'true')
		window.localStorage.setItem('bucket', 'archive')
		window.localStorage.setItem('objectsSearch', 'photos')
		window.localStorage.setItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY, '6')
		window.localStorage.setItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY, '4')
		window.localStorage.setItem(serverScopedStorageKey('app', 'token-a', 'profileId'), JSON.stringify('profile-1'))
		window.localStorage.setItem('objects:profile-1:prefix', 'nested/')
		window.localStorage.setItem('uploads:profile-1:bucket', JSON.stringify('incoming'))
		window.localStorage.setItem('jobs:profile-1:bucket', JSON.stringify('jobs-bucket'))
		window.localStorage.setItem('other:profile-1:value', 'keep')

		clearResettableUiState(window.localStorage)

		expect(window.localStorage.getItem('apiToken')).toBe('keep-token')
		expect(window.localStorage.getItem('downloadLinkProxyEnabled')).toBe('true')
		expect(window.localStorage.getItem('other:profile-1:value')).toBe('keep')
		expect(window.localStorage.getItem('bucket')).toBeNull()
		expect(window.localStorage.getItem('objectsSearch')).toBeNull()
		expect(window.localStorage.getItem(DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBeNull()
		expect(window.localStorage.getItem(UPLOAD_TASK_CONCURRENCY_STORAGE_KEY)).toBeNull()
		expect(window.localStorage.getItem(serverScopedStorageKey('app', 'token-a', 'profileId'))).toBeNull()
		expect(window.localStorage.getItem('objects:profile-1:prefix')).toBeNull()
		expect(window.localStorage.getItem('uploads:profile-1:bucket')).toBeNull()
		expect(window.localStorage.getItem('jobs:profile-1:bucket')).toBeNull()
	})
})
