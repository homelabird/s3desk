import type { APIClientShape } from '../../api/client'
import type { BucketsPageShellViewProps } from './bucketsPagePresentationTypes'
import { buildBucketsPageShellViewProps } from './buildBucketsPageShellViewProps'
import type { BucketsPageFeatureState } from './useBucketsPageFeatureState'
import type { BucketsPageQueriesState } from './useBucketsPageQueriesState'
import type { BucketsPageScopeState } from './useBucketsPageScopeState'

type BuildBucketsPageControllerStateArgs = {
	api: APIClientShape
	scopeState: BucketsPageScopeState
	queriesState: BucketsPageQueriesState
	featureState: BucketsPageFeatureState
	useCompactList: boolean
}

export type BucketsPageControllerState = {
	currentScopeKey: string
	queries: BucketsPageQueriesState
	shell: BucketsPageShellViewProps
}

export function buildBucketsPageControllerState({
	api,
	scopeState,
	queriesState,
	featureState,
	useCompactList,
}: BuildBucketsPageControllerStateArgs): BucketsPageControllerState {
	return {
		currentScopeKey: scopeState.currentScopeKey,
		queries: queriesState,
		shell: buildBucketsPageShellViewProps({
			api,
			scopeState,
			queriesState,
			featureState,
			useCompactList,
		}),
	}
}
