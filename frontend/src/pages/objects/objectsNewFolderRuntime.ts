import type { APIClientShape } from '../../api/client'

import { getVisibleCreatedPrefix } from './objectsCreatedPrefix'
import {
	displayNameForPrefix,
	matchesSearchTokens,
	normalizeForSearch,
	normalizePrefix,
	splitSearchTokens,
} from './objectsListUtils'
import type { ObjectTypeFilter } from './objectsTypes'

export type NewFolderFormValues = { name: string; allowPath: boolean }

type CreateFolderPlan = {
	parentPrefix: string
	parts: string[]
	key: string
	visiblePrefix: string
}

type NewFolderVisibilityOutcome = {
	parentPrefixNormalized: string
	currentPrefixNormalized: string
	parentIsCurrent: boolean
	createdOutsideView: boolean
	viewHideReason: 'favoritesOnly' | 'filesOnly' | 'search' | null
	viewHideLabel: string | null
	createdOutsideLabel: string | null
	visiblePrefix: string
	autoOpened: boolean
	shouldVerifyVisibleAfterRefresh: boolean
	parentTreeKey: string
}

export function normalizeNewFolderPrefix(prefix: string): string {
	return normalizePrefix(prefix)
}

export function buildCreateFolderPlan(values: NewFolderFormValues, parentPrefix: string): CreateFolderPlan {
	const allowPath = !!values.allowPath
	const rawInput = values.name.trim().replace(/\/+$/, '').replace(/^\/+/, '')
	if (!rawInput) throw new Error('folder name is required')
	if (rawInput.includes('\u0000')) throw new Error('invalid folder name')

	const parts = rawInput.split('/').filter(Boolean)
	if (parts.length === 0) throw new Error('folder name is required')
	if (!allowPath && parts.length > 1) throw new Error("folder name must not contain '/'")
	for (const part of parts) {
		if (part === '.' || part === '..') throw new Error('invalid folder name')
	}

	const normalizedParentPrefix = normalizePrefix(parentPrefix)
	let key = normalizedParentPrefix
	for (const part of parts) {
		key = `${key}${part}/`
	}

	return {
		parentPrefix: normalizedParentPrefix,
		parts,
		key,
		visiblePrefix: getVisibleCreatedPrefix(normalizedParentPrefix, key),
	}
}

export async function createFolderPath(args: {
	api: APIClientShape
	profileId: string
	bucket: string
	parentPrefix: string
	values: NewFolderFormValues
}): Promise<{ key: string }> {
	const plan = buildCreateFolderPlan(args.values, args.parentPrefix)
	let current = plan.parentPrefix
	let last = ''
	try {
		for (const part of plan.parts) {
			current = `${current}${part}/`
			await args.api.objects.createFolder({ profileId: args.profileId, bucket: args.bucket, key: current })
			last = current
		}
	} catch (err) {
		const e = err instanceof Error ? err : new Error(String(err))
		;(e as { partialKey?: string }).partialKey = last || undefined
		throw e
	}
	return { key: last }
}

export function buildNewFolderVisibilityOutcome(args: {
	createdKey: string
	parentPrefix: string
	currentPrefix: string
	typeFilter: ObjectTypeFilter
	favoritesOnly: boolean
	searchText: string
}): NewFolderVisibilityOutcome {
	const parentPrefixNormalized = normalizePrefix(args.parentPrefix)
	const currentPrefixNormalized = normalizePrefix(args.currentPrefix)
	const parentIsCurrent = parentPrefixNormalized === currentPrefixNormalized
	const createdOutsideView = !parentIsCurrent
	const searchRaw = (args.searchText ?? '').trim()
	const tokens = splitSearchTokens(searchRaw)
	const normalizedTokens = tokens.map(normalizeForSearch)
	const matchesSearch = (value: string) => matchesSearchTokens(value, tokens, normalizedTokens)

	let viewHideReason: NewFolderVisibilityOutcome['viewHideReason'] = null
	if (parentIsCurrent) {
		if (args.favoritesOnly) {
			viewHideReason = 'favoritesOnly'
		} else if (args.typeFilter === 'files') {
			viewHideReason = 'filesOnly'
		} else if (tokens.length > 0) {
			const displayName = displayNameForPrefix(args.createdKey, args.currentPrefix)
			if (!(matchesSearch(displayName) || matchesSearch(args.createdKey))) {
				viewHideReason = 'search'
			}
		}
	}

	const visiblePrefix = getVisibleCreatedPrefix(parentPrefixNormalized, args.createdKey)
	const autoOpened = parentIsCurrent && !!viewHideReason

	return {
		parentPrefixNormalized,
		currentPrefixNormalized,
		parentIsCurrent,
		createdOutsideView,
		viewHideReason,
		viewHideLabel:
			viewHideReason === 'favoritesOnly'
				? 'favorites-only view'
				: viewHideReason === 'filesOnly'
					? 'files-only view'
					: viewHideReason === 'search'
						? 'search filter'
						: null,
		createdOutsideLabel: createdOutsideView ? (parentPrefixNormalized || '/') : null,
		visiblePrefix,
		autoOpened,
		shouldVerifyVisibleAfterRefresh: parentIsCurrent && !viewHideReason && !createdOutsideView,
		parentTreeKey: parentPrefixNormalized || '/',
	}
}
