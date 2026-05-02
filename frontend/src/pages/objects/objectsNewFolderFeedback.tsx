import type { CSSProperties } from 'react'

import { objectsFeedback } from './objectsFeedback'

type HiddenReason = 'favoritesOnly' | 'filesOnly' | 'search'

type NewFolderFeedbackCallbacks = {
	onClearSearch: () => void
	onDisableFavoritesOnly: () => void
	onOpenPrefix: (prefix: string) => void
	onShowFolders: () => void
}

type NewFolderCreatedFeedbackArgs = NewFolderFeedbackCallbacks & {
	autoOpened: boolean
	createdKey: string
	createdOutsideLabel: string | null
	createdOutsideView: boolean
	parentPrefix: string
	viewHideLabel: string | null
	viewHideReason: HiddenReason | null
}

type NewFolderVisibilityWarningArgs = Pick<NewFolderFeedbackCallbacks, 'onOpenPrefix'> & {
	createdKey: string
}

const toastButtonStyle: CSSProperties = {
	border: 0,
	background: 'transparent',
	color: 'var(--s3d-color-accent)',
	cursor: 'pointer',
	padding: '0 4px',
}

function renderToastButton(label: string, onClick: () => void) {
	return (
		<button type="button" style={toastButtonStyle} onClick={onClick}>
			{label}
		</button>
	)
}

export function showNewFolderVisibilityWarning({ createdKey, onOpenPrefix }: NewFolderVisibilityWarningArgs) {
	objectsFeedback.warning({
		duration: 8,
		content: (
			<span>
				Folder create request completed, but the provider did not return it after refresh: <code>{createdKey}</code>{' '}
				{renderToastButton('Open', () => onOpenPrefix(createdKey))}
			</span>
		),
	})
}

export function showNewFolderCreatedFeedback({
	autoOpened,
	createdKey,
	createdOutsideLabel,
	createdOutsideView,
	onClearSearch,
	onDisableFavoritesOnly,
	onOpenPrefix,
	onShowFolders,
	parentPrefix,
	viewHideLabel,
	viewHideReason,
}: NewFolderCreatedFeedbackArgs) {
	objectsFeedback.success({
		duration: 6,
		content: (
			<span>
				Folder created{autoOpened ? ' and opened' : ''}
				{viewHideLabel ? ` (${viewHideLabel})` : createdOutsideLabel ? ` (under ${createdOutsideLabel})` : ''}: <code>{createdKey}</code>{' '}
				{renderToastButton(autoOpened ? 'Reopen' : 'Open', () => onOpenPrefix(createdKey))}
				{autoOpened || createdOutsideView ? (
					<>
						{renderToastButton('Parent', () => onOpenPrefix(parentPrefix))}
						{autoOpened ? (
							<>
								{viewHideReason === 'favoritesOnly' ? (
									renderToastButton('Disable favorites-only', onDisableFavoritesOnly)
								) : viewHideReason === 'filesOnly' ? (
									renderToastButton('Show folders', onShowFolders)
								) : viewHideReason === 'search' ? (
									renderToastButton('Clear search', onClearSearch)
								) : null}
							</>
						) : null}
					</>
				) : null}
			</span>
		),
	})
}
