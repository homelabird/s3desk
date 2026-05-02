import { describe, expect, it } from 'vitest'

import { buildObjectsPageDataState } from '../buildObjectsPageDataState'

type BuildArgs = Parameters<typeof buildObjectsPageDataState>[0]

function namespace(label: string, overrides: Record<string, unknown> = {}) {
	return new Proxy(overrides, {
		get(target, prop: string | symbol) {
			if (prop in target) return target[prop as keyof typeof target]
			return `${label}.${String(prop)}`
		},
	})
}

function buildArgs(): BuildArgs {
	const environment = namespace('environment', {
		api: { id: 'api' },
		queryClient: { id: 'query-client' },
		screens: { md: true, xl: true },
		transfers: { activeTransferCount: 0 },
	})
	const location = namespace('location', {
		activeTabId: 'tab-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		prefixByBucketRef: { current: { 'bucket-a': 'docs/' } },
		recentBuckets: ['bucket-a'],
		tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: 'docs/' }],
	})
	const tree = namespace('tree', {
		treeSelectedKeys: ['/'],
		treeExpandedKeys: ['/'],
	})
	const view = namespace('view', {
		detailsOpen: true,
		dockDetails: true,
		dockTree: true,
		favoritesOnly: false,
		favoritesFirst: true,
		isDesktop: true,
		search: '',
		sort: 'name_asc',
		typeFilter: 'all',
	})
	const queries = namespace('queries', {
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
		bucketsQuery: { isFetching: false },
		favoriteItems: [{ key: 'docs/report.pdf' }],
		favoriteKeys: new Set(['docs/report.pdf']),
		favoritesQuery: { isFetching: false },
		objectsQuery: { data: { pages: [] } },
		profileCapabilities: { presignedUpload: true },
		selectedProfile: { provider: 'aws_s3' },
	})
	const search = namespace('search', {
		rows: [{ type: 'object', key: 'docs/report.pdf' }],
		visibleObjectKeys: new Set(['docs/report.pdf']),
		orderedVisibleObjectKeys: ['docs/report.pdf'],
	})
	const selection = namespace('selection', {
		selectedCount: 1,
		selectedKeys: new Set(['docs/report.pdf']),
	})
	const jobs = namespace('jobs', {
		indexObjectsJobMutation: { isPending: false },
		zipObjectsJobMutation: { isPending: false },
		zipPrefixJobMutation: { isPending: false },
	})
	const prefetch = namespace('prefetch')

	return {
		environment,
		location,
		tree,
		view,
		queries,
		search,
		jobs,
		selection,
		prefetch,
		handleTreeSelect: () => undefined,
	} as unknown as BuildArgs
}

describe('buildObjectsPageDataState', () => {
	it('exposes scoped slice view-models without duplicating the legacy flat state surface', () => {
		const state = buildObjectsPageDataState(buildArgs())

		expect(Object.keys(state).sort()).toEqual([
			'listVm',
			'locationVm',
			'operationVm',
			'paneVm',
			'selectionVm',
		])
		expect(state.locationVm).toMatchObject({
			bucket: 'bucket-a',
			prefix: 'docs/',
			tabs: [{ id: 'tab-1', bucket: 'bucket-a', prefix: 'docs/' }],
		})
		expect(state.listVm).toMatchObject({
			rows: [{ type: 'object', key: 'docs/report.pdf' }],
			objectsQuery: { data: { pages: [] } },
			favoritesOnly: false,
		})
		expect(state.selectionVm).toMatchObject({
			selectedCount: 1,
			selectedKeys: new Set(['docs/report.pdf']),
		})
		expect(state.operationVm).toMatchObject({
			api: { id: 'api' },
			profileCapabilities: { presignedUpload: true },
			zipObjectsJobMutation: { isPending: false },
		})
		expect(state.paneVm).toMatchObject({
			detailsOpen: true,
			treeSelectedKeys: ['/'],
			handleTreeSelect: expect.any(Function),
		})
	})
})
