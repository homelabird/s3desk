import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { APIClient } from '../../../api/client'
import { useJobsUploadDetails } from '../useJobsUploadDetails'

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})

	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useJobsUploadDetails', () => {
	it('parses upload details for direct upload jobs', async () => {
		const getJob = vi.fn().mockResolvedValue({
			id: 'job-direct-upload',
			type: 'transfer_direct_upload',
			status: 'succeeded',
			payload: {
				bucket: 'demo-bucket',
				prefix: 'exports/',
				rootKind: 'file',
				rootName: 'alpha.txt',
				totalFiles: 1,
				totalBytes: 110676,
				items: [{ path: 'alpha.txt', key: 'exports/alpha.txt', size: 110676 }],
			},
			createdAt: '2024-01-01T00:00:00Z',
		})
		const getObjectMeta = vi.fn().mockResolvedValue({ etag: 'etag-alpha' })
		const api = {
			getJob,
			getObjectMeta,
		} as unknown as APIClient

		const { result } = renderHook(
			() =>
				useJobsUploadDetails({
					api,
					profileId: 'profile-1',
					apiToken: 'token',
					detailsJobId: 'job-direct-upload',
					detailsOpen: true,
				}),
			{
				wrapper: createWrapper(),
			},
		)

		await waitFor(() => {
			expect(result.current.uploadTablePageItems[0]?.etag).toBe('etag-alpha')
		})

		expect(result.current.uploadRootLabel).toBe('file alpha.txt')
		expect(result.current.uploadTablePageItems).toEqual([
			{
				key: 'exports/alpha.txt',
				path: 'alpha.txt',
				size: 110676,
				etag: 'etag-alpha',
			},
		])
		expect(getJob).toHaveBeenCalledWith('profile-1', 'job-direct-upload')
		expect(getObjectMeta).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'demo-bucket',
			key: 'exports/alpha.txt',
		})
	})
})
