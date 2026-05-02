import { describe, expect, it, vi } from 'vitest'

import {
	buildCreateFolderPlan,
	buildNewFolderVisibilityOutcome,
	createFolderPath,
} from '../objectsNewFolderRuntime'

describe('objectsNewFolderRuntime', () => {
	it('builds normalized marker paths and rejects nested paths unless explicitly allowed', () => {
		expect(buildCreateFolderPlan({ name: '/reports/', allowPath: false }, 'root/')).toMatchObject({
			parentPrefix: 'root/',
			parts: ['reports'],
			key: 'root/reports/',
			visiblePrefix: 'root/reports/',
		})

		expect(() => buildCreateFolderPlan({ name: 'a/b', allowPath: false }, '')).toThrow("folder name must not contain '/'")
		expect(buildCreateFolderPlan({ name: 'a/b', allowPath: true }, '')).toMatchObject({
			parts: ['a', 'b'],
			key: 'a/b/',
			visiblePrefix: 'a/',
		})
	})

	it('creates each nested marker and reports the last partial key on failure', async () => {
		const createFolder = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('create failed'))

		await expect(
			createFolderPath({
				api: { objects: { createFolder } } as never,
				profileId: 'profile-1',
				bucket: 'bucket-a',
				parentPrefix: 'docs/',
				values: { name: 'a/b/c', allowPath: true },
			}),
		).rejects.toMatchObject({ message: 'create failed', partialKey: 'docs/a/' })

		expect(createFolder).toHaveBeenNthCalledWith(1, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'docs/a/',
		})
		expect(createFolder).toHaveBeenNthCalledWith(2, {
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'docs/a/b/',
		})
	})

	it('describes why a created folder is hidden from the current object view', () => {
		expect(
			buildNewFolderVisibilityOutcome({
				createdKey: 'reports/private/',
				parentPrefix: 'reports/',
				currentPrefix: 'reports/',
				typeFilter: 'files',
				favoritesOnly: false,
				searchText: '',
			}),
		).toMatchObject({
			autoOpened: true,
			viewHideReason: 'filesOnly',
			viewHideLabel: 'files-only view',
			createdOutsideView: false,
			parentTreeKey: 'reports/',
		})

		expect(
			buildNewFolderVisibilityOutcome({
				createdKey: 'reports/private/',
				parentPrefix: 'reports/',
				currentPrefix: '',
				typeFilter: 'all',
				favoritesOnly: false,
				searchText: '',
			}),
		).toMatchObject({
			autoOpened: false,
			createdOutsideLabel: 'reports/',
			createdOutsideView: true,
			visiblePrefix: 'reports/private/',
		})
	})
})
