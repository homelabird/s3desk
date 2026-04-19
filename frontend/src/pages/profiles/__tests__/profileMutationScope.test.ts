import { describe, expect, it } from 'vitest'

import {
	matchesCurrentMutationRequest,
	matchesScopedProfileRequest,
	matchesScopedSession,
} from '../profileMutationScope'

describe('profileMutationScope', () => {
	it('matches scoped profile requests only for the current scope and profile token', () => {
		const baseArgs = {
			isActiveRef: { current: true },
			currentScopeKey: 'token-a::profiles',
			currentScopeVersion: 3,
		}

		expect(
			matchesScopedProfileRequest({
				...baseArgs,
				context: {
					scopeKey: 'token-a::profiles',
					scopeVersion: 3,
					requestId: 7,
					profileId: 'profile-1',
				},
				expectedRequestId: 7,
				expectedProfileId: 'profile-1',
			}),
		).toBe(true)

		expect(
			matchesScopedProfileRequest({
				...baseArgs,
				context: {
					scopeKey: 'token-a::profiles',
					scopeVersion: 3,
					requestId: 8,
					profileId: 'profile-1',
				},
				expectedRequestId: 7,
				expectedProfileId: 'profile-1',
			}),
		).toBe(false)

		expect(
			matchesScopedProfileRequest({
				...baseArgs,
				context: {
					scopeKey: 'token-b::profiles',
					scopeVersion: 3,
					requestId: 7,
					profileId: 'profile-1',
				},
				expectedRequestId: 7,
				expectedProfileId: 'profile-1',
			}),
		).toBe(false)
	})

	it('matches scoped session and mutation requests only for active current scope state', () => {
		const baseArgs = {
			isActiveRef: { current: true },
			currentScopeKey: 'token-a::profiles',
			currentScopeVersion: 5,
		}

		expect(
			matchesScopedSession({
				...baseArgs,
				context: {
					scopeKey: 'token-a::profiles',
					scopeVersion: 5,
					sessionToken: 4,
				},
				expectedSessionToken: 4,
			}),
		).toBe(true)
		expect(
			matchesCurrentMutationRequest({
				...baseArgs,
				context: {
					scopeKey: 'token-a::profiles',
					scopeVersion: 5,
					requestToken: 9,
					modalSession: 2,
				},
				expectedRequestToken: 9,
				expectedModalSession: 2,
			}),
		).toBe(true)
		expect(
			matchesCurrentMutationRequest({
				...baseArgs,
				context: {
					scopeKey: 'token-a::profiles',
					scopeVersion: 5,
					requestToken: 9,
					modalSession: 3,
				},
				expectedRequestToken: 9,
				expectedModalSession: 2,
			}),
		).toBe(false)
	})
})
