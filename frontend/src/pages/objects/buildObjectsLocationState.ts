import type { useObjectsInvalidLocationCleanup } from './useObjectsInvalidLocationCleanup'
import type { useObjectsLocationPersistence } from './useObjectsLocationPersistence'
import type { useObjectsLocationTabs } from './useObjectsLocationTabs'
import type { useObjectsPathBookmarks } from './useObjectsPathBookmarks'
import type { useObjectsPathModalState } from './useObjectsPathModalState'

type BuildObjectsLocationStateArgs = {
	bookmarks: ReturnType<typeof useObjectsPathBookmarks>
	canGoUp: boolean
	clearInvalidLocation: ReturnType<typeof useObjectsInvalidLocationCleanup>
	navigation: ReturnType<typeof useObjectsLocationTabs>
	onOpenPrefix: (nextPrefix: string) => void
	onUp: () => void
	persistence: ReturnType<typeof useObjectsLocationPersistence>
	pathModal: ReturnType<typeof useObjectsPathModalState>
}

export function buildObjectsLocationState({
	bookmarks,
	canGoUp,
	clearInvalidLocation,
	navigation,
	onOpenPrefix,
	onUp,
	persistence,
	pathModal,
}: BuildObjectsLocationStateArgs) {
	return {
		bucket: persistence.bucket,
		prefix: persistence.prefix,
		tabs: persistence.tabs,
		activeTabId: persistence.activeTabId,
		recentBuckets: persistence.recentBuckets,
		setActiveTabId: persistence.setActiveTabId,
		pathDraft: pathModal.pathDraft,
		setPathDraft: pathModal.setPathDraft,
		pathModalOpen: pathModal.pathModalOpen,
		setPathModalOpen: pathModal.setPathModalOpen,
		pathInputRef: pathModal.pathInputRef,
		openPathModal: pathModal.openPathModal,
		prefixByBucketRef: persistence.prefixByBucketRef,
		navigateToLocation: navigation.navigateToLocation,
		canGoBack: navigation.canGoBack,
		canGoForward: navigation.canGoForward,
		goBack: navigation.goBack,
		goForward: navigation.goForward,
		addTab: navigation.addTab,
		closeTab: navigation.closeTab,
		pathOptions: bookmarks.pathOptions,
		isBookmarked: bookmarks.isBookmarked,
		toggleBookmark: bookmarks.toggleBookmark,
		canGoUp,
		onUp,
		onOpenPrefix,
		commitPathDraft: pathModal.commitPathDraft,
		clearInvalidLocation,
	}
}
