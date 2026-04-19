import type { MutableRefObject } from 'react'

export type PendingProfileState = {
	profileId: string
	scopeKey: string
}

export type PendingModalState = {
	session: number
	scopeKey: string
}

export type ScopedContext = {
	scopeKey: string
	scopeVersion: number
}

export type MutationContext = ScopedContext & {
	requestToken: number
	modalSession?: number
}

export type ScopedRequestIdContext = ScopedContext & {
	requestId: number
}

export type ScopedProfileRequestContext = ScopedRequestIdContext & {
	profileId: string
}

export type ScopedSessionContext = ScopedContext & {
	sessionToken: number
}

export function matchesServerScope(args: {
	context: ScopedContext | undefined
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

export function matchesScopedRequestId(args: {
	context: ScopedRequestIdContext | undefined
	isActiveRef: MutableRefObject<boolean>
	currentScopeKey: string
	currentScopeVersion: number
	expectedRequestId: number
}) {
	const { context, isActiveRef, currentScopeKey, currentScopeVersion, expectedRequestId } = args
	if (!matchesServerScope({ context, isActiveRef, currentScopeKey, currentScopeVersion })) {
		return false
	}
	if (!context) {
		return false
	}
	return context.requestId === expectedRequestId
}

export function matchesScopedProfileRequest(args: {
	context: ScopedProfileRequestContext | undefined
	isActiveRef: MutableRefObject<boolean>
	currentScopeKey: string
	currentScopeVersion: number
	expectedRequestId: number
	expectedProfileId: string | null
}) {
	const {
		context,
		isActiveRef,
		currentScopeKey,
		currentScopeVersion,
		expectedRequestId,
		expectedProfileId,
	} = args
	if (
		!matchesScopedRequestId({
			context,
			isActiveRef,
			currentScopeKey,
			currentScopeVersion,
			expectedRequestId,
		})
	) {
		return false
	}
	if (!context) {
		return false
	}
	return context.profileId === expectedProfileId
}

export function matchesScopedSession(args: {
	context: ScopedSessionContext | undefined
	isActiveRef: MutableRefObject<boolean>
	currentScopeKey: string
	currentScopeVersion: number
	expectedSessionToken: number
}) {
	const { context, isActiveRef, currentScopeKey, currentScopeVersion, expectedSessionToken } = args
	if (!matchesServerScope({ context, isActiveRef, currentScopeKey, currentScopeVersion })) {
		return false
	}
	if (!context) {
		return false
	}
	return context.sessionToken === expectedSessionToken
}

export function clearPendingModalState(prev: PendingModalState | null, scopeKey?: string, modalSession?: number) {
	return prev?.scopeKey === scopeKey && prev?.session === modalSession ? null : prev
}

export function clearPendingProfileState(prev: PendingProfileState | null, profileId: string, scopeKey?: string) {
	return prev?.profileId === profileId && prev?.scopeKey === scopeKey ? null : prev
}
