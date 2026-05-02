import { buildObjectsPageDataState, type ObjectsPageDataState } from './buildObjectsPageDataState'
import { useObjectsPageCoreState } from './useObjectsPageCoreState'
import { useObjectsPageJobs } from './useObjectsPageJobs'
import { useObjectsPagePrefetchControls } from './useObjectsPagePrefetchControls'
import { useObjectsPageSearchState } from './useObjectsPageSearchState'
import { useObjectsPageSelectionControls } from './useObjectsPageSelectionControls'
import { useObjectsSelection } from './useObjectsSelection'
import { useObjectsTreeNavigation } from './useObjectsTreeNavigation'

type Props = {
	apiToken: string
	profileId: string | null
}

export function useObjectsPageData(props: Props): ObjectsPageDataState {
	const coreState = useObjectsPageCoreState(props)
	const { environment, location: locationState, queries: queriesState, tree: treeState, view: viewState } = coreState

	const selectionState = useObjectsSelection()

	const searchState = useObjectsPageSearchState({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		location: locationState,
		view: viewState,
		queries: queriesState,
		selection: selectionState,
	})

	const selectionControls = useObjectsPageSelectionControls({
		selectionState,
		searchState,
	})

	const jobs = useObjectsPageJobs({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		bucket: locationState.bucket,
		prefix: locationState.prefix,
		transfers: environment.transfers,
		createJobWithRetry: environment.createJobWithRetry,
		globalSearchOpen: viewState.globalSearchOpen,
		globalSearchQueryText: searchState.globalSearchQueryText,
		globalSearchPrefixNormalized: searchState.globalSearchPrefixNormalized,
		objectsCostMode: viewState.objectsCostMode,
		autoIndexEnabled: viewState.autoIndexEnabled,
		autoIndexTtlMs: viewState.autoIndexTtlMs,
		setIndexPrefix: viewState.setIndexPrefix,
	})

	const prefetchState = useObjectsPagePrefetchControls({
		api: environment.api,
		apiToken: props.apiToken,
		profileId: props.profileId,
		profileProvider: queriesState.selectedProfile?.provider ?? null,
		objectsCostMode: viewState.objectsCostMode,
		queryClient: environment.queryClient,
		bucket: locationState.bucket,
		recentBuckets: locationState.recentBuckets,
		bucketOptions: queriesState.bucketOptions,
		prefixByBucketRef: locationState.prefixByBucketRef,
	})

	const handleTreeSelect = useObjectsTreeNavigation({
		location: locationState,
		tree: treeState,
	})

	return buildObjectsPageDataState({
		environment,
		location: locationState,
		tree: treeState,
		view: viewState,
		queries: queriesState,
		search: searchState,
		jobs,
		selection: selectionControls,
		prefetch: prefetchState,
		handleTreeSelect,
	})
}
