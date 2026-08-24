import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import type { APIClientShape } from '../../api/client'
import { objectsFeedback } from './objectsFeedback'

type Presign = { key: string; url: string; expiresAt: string }
type PresignRequest = { key: string; size?: number; lastModified?: string }
type PresignResponse = Awaited<ReturnType<APIClientShape['objects']['getObjectDownloadURL']>>
type PresignOperation = {
	request: PresignRequest
	requestToken: number
	controller: AbortController
}
type PresignMutationContext = Pick<PresignOperation, 'requestToken' | 'controller'>
type PresignMutation = UseMutationResult<PresignResponse, Error, PresignRequest, PresignMutationContext>

type UseObjectsPresignArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	bucket: string
	downloadLinkProxyEnabled: boolean
	presignedDownloadSupported: boolean
}

export function useObjectsPresign({
	api,
	apiToken,
	profileId,
	bucket,
	downloadLinkProxyEnabled,
	presignedDownloadSupported,
}: UseObjectsPresignArgs) {
	const [presignState, setPresignState] = useState<{
		scopeKey: string
		open: boolean
		presign: Presign | null
		key: string | null
	}>({
		scopeKey: '',
		open: false,
		presign: null,
		key: null,
	})
	const requestTokenRef = useRef(0)
	const abortControllerRef = useRef<AbortController | null>(null)
	const scopeKey = `${apiToken}:${profileId ?? ''}:${bucket}:${downloadLinkProxyEnabled ? 'proxy' : 'direct'}:${presignedDownloadSupported ? 'presign' : 'proxy-only'}`

	useEffect(() => {
		return () => {
			requestTokenRef.current += 1
			abortControllerRef.current?.abort()
			abortControllerRef.current = null
		}
	}, [scopeKey])

	const beginPresign = useCallback((request: PresignRequest): PresignOperation => {
		const requestToken = requestTokenRef.current + 1
		requestTokenRef.current = requestToken
		abortControllerRef.current?.abort()
		const controller = new AbortController()
		abortControllerRef.current = controller
		return { request, requestToken, controller }
	}, [])

	const internalPresignMutation = useMutation<PresignResponse, Error, PresignOperation, PresignMutationContext>({
		mutationFn: ({ request, controller }) => {
			controller.signal.throwIfAborted()
			return api.objects.getObjectDownloadURL({
				profileId: profileId!,
				bucket,
				key: request.key,
				proxy: true,
				size: request.size,
				lastModified: request.lastModified,
				signal: controller.signal,
			})
		},
		onMutate: ({ request, requestToken, controller }) => {
			if (requestTokenRef.current !== requestToken || abortControllerRef.current !== controller) {
				return { requestToken, controller }
			}
			setPresignState((prev) => ({
				...prev,
				scopeKey,
				key: request.key,
			}))
			return { requestToken, controller }
		},
		onSuccess: (resp, { request }, context) => {
			if (requestTokenRef.current !== context.requestToken || abortControllerRef.current !== context.controller) return
			setPresignState((prev) => ({
				...prev,
				scopeKey,
				open: true,
				presign: { key: request.key, url: resp.url, expiresAt: resp.expiresAt },
			}))
		},
		onSettled: (_, __, { request }, context) => {
			if (
				!context ||
				requestTokenRef.current !== context.requestToken ||
				abortControllerRef.current !== context.controller
			) {
				return
			}
			abortControllerRef.current = null
			setPresignState((prev) =>
				prev.key === request.key
					? {
							...prev,
							scopeKey,
							key: null,
						}
					: prev,
			)
		},
		onError: (err, _operation, context) => {
			if (
				!context ||
				requestTokenRef.current !== context.requestToken ||
				abortControllerRef.current !== context.controller
			) {
				return
			}
			objectsFeedback.error(err)
		},
	})
	const { mutate: internalMutate, mutateAsync: internalMutateAsync } = internalPresignMutation

	const mutate: PresignMutation['mutate'] = useCallback(
		(request, options) => {
			internalMutate(beginPresign(request), {
				onSuccess: (data, operation, context, mutationContext) =>
					options?.onSuccess?.(data, operation.request, context, mutationContext),
				onError: (error, operation, context, mutationContext) =>
					options?.onError?.(error, operation.request, context, mutationContext),
				onSettled: (data, error, operation, context, mutationContext) =>
					options?.onSettled?.(data, error, operation.request, context, mutationContext),
			})
		},
		[beginPresign, internalMutate],
	)

	const mutateAsync: PresignMutation['mutateAsync'] = useCallback(
		(request, options) =>
			internalMutateAsync(beginPresign(request), {
				onSuccess: (data, operation, context, mutationContext) =>
					options?.onSuccess?.(data, operation.request, context, mutationContext),
				onError: (error, operation, context, mutationContext) =>
					options?.onError?.(error, operation.request, context, mutationContext),
				onSettled: (data, error, operation, context, mutationContext) =>
					options?.onSettled?.(data, error, operation.request, context, mutationContext),
			}),
		[beginPresign, internalMutateAsync],
	)

	const presignMutation = {
		...internalPresignMutation,
		variables: internalPresignMutation.variables?.request,
		mutate,
		mutateAsync,
	} as PresignMutation

	const closePresign = useCallback(() => {
		requestTokenRef.current += 1
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
		setPresignState({
			scopeKey,
			open: false,
			presign: null,
			key: null,
		})
	}, [scopeKey])

	const visiblePresignOpen = presignState.scopeKey === scopeKey ? presignState.open : false
	const visiblePresign = presignState.scopeKey === scopeKey ? presignState.presign : null
	const visiblePresignKey = presignState.scopeKey === scopeKey ? presignState.key : null

	return {
		presignOpen: visiblePresignOpen,
		presign: visiblePresign,
		presignKey: visiblePresignKey,
		presignMutation,
		closePresign,
	}
}
