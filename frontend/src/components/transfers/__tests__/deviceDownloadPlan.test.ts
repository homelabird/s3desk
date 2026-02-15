import { describe, expect, it } from 'vitest'

import { planObjectDeviceDownloadTasks } from '../deviceDownloadPlan'

describe('planObjectDeviceDownloadTasks', () => {
	it('skips folder keys and plans relative paths under the provided prefix', () => {
		const targetDirHandle = {} as unknown as FileSystemDirectoryHandle
		let seq = 0
		const tasks = planObjectDeviceDownloadTasks({
			profileId: 'p1',
			bucket: 'b1',
			prefix: 'root',
			targetDirHandle,
			targetLabel: 'Downloads',
			items: [
				{ key: 'root/a/b.txt', size: 123 },
				{ key: 'root/dir/' },
				{ key: '' },
			],
			makeId: () => `id_${++seq}`,
			nowMs: () => 1000,
		})

		expect(tasks).toHaveLength(1)
		expect(tasks[0]).toMatchObject({
			id: 'id_1',
			kind: 'object_device',
			profileId: 'p1',
			bucket: 'b1',
			key: 'root/a/b.txt',
			label: 'a/b.txt',
			targetPath: 'a/b.txt',
			filenameHint: 'b.txt',
			targetDirHandle,
			targetLabel: 'Downloads',
			totalBytes: 123,
			createdAtMs: 1000,
		})
	})

	it('normalizes traversal and backslashes in target paths', () => {
		const targetDirHandle = {} as unknown as FileSystemDirectoryHandle
		const tasks = planObjectDeviceDownloadTasks({
			profileId: 'p1',
			bucket: 'b1',
			prefix: 'root/',
			targetDirHandle,
			items: [{ key: 'root/a/../c\\\\d.txt' }],
			makeId: () => 'id_1',
			nowMs: () => 1000,
		})

		expect(tasks).toHaveLength(1)
		expect(tasks[0]?.targetPath).toBe('a/c/d.txt')
	})
})
