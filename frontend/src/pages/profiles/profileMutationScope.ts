import type { MutableRefObject } from 'react'

export type PendingProfileState = {
	profileId: string
	scopeKey: string
}

export type PendingModalState = {
	session: number
	scopeKey: string
}

type MutationContext = {
	scopeKey: string
	scopeVersion: number
	requestToken: number
	modalSession?: number
}

export function matchesServerScope(args: {
	context: MutationContext | undefined
	isActiveRef: MutableRefObject<boolean>
	currentScopeKey: string
	currentScopeVersion: number
}) {
	const { context, isActiveRef, currentScopeKey, currentScopeVersion } = args
	return !!context && isActiveRef.current && context.scopeVersion === currentScopeVersion && context.scopeKey === currentScopeKey
}

export function matchesCurrentMutationRequest(args: {
	context: MutationContext | undefined
	isActiveRef: MutableRefObject<boolean>
	currentScopeKey: string
	currentScopeVersion: number
	expectedRequestToken: number
	expectedModalSession?: number
}) {
	const {
		context,
		isActiveRef,
		currentScopeKey,
		currentScopeVersion,
		expectedRequestToken,
		expectedModalSession,
	} = args
		if (!matchesServerScope({ context, isActiveRef, currentScopeKey, currentScopeVersion })) {
			return false
		}
		if (!context) {
			return false
		}
		if (context.requestToken !== expectedRequestToken) {
			return false
		}
	if (expectedModalSession !== undefined && context.modalSession !== expectedModalSession) {
		return false
	}
	return true
}

export function clearPendingModalState(prev: PendingModalState | null, scopeKey?: string, modalSession?: number) {
	return prev?.scopeKey === scopeKey && prev?.session === modalSession ? null : prev
}

export function clearPendingProfileState(prev: PendingProfileState | null, profileId: string, scopeKey?: string) {
	return prev?.profileId === profileId && prev?.scopeKey === scopeKey ? null : prev
}
