import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIError } from '../../../api/client'
import { ensureDomShims } from '../../../test/domShims'
import { BucketPolicyModal } from '../BucketPolicyModal'

const originalGetComputedStyle = window.getComputedStyle
const originalMatchMedia = window.matchMedia
const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')

beforeAll(() => {
	ensureDomShims()
	window.getComputedStyle = ((element: Element, pseudoElt?: string) => {
		const style = originalGetComputedStyle(element, pseudoElt ? undefined : pseudoElt)
		const fallbackValues: Record<string, string> = {
			lineHeight: '20px',
			paddingTop: '0px',
			paddingBottom: '0px',
			paddingLeft: '0px',
			paddingRight: '0px',
			fontSize: '14px',
			borderTopWidth: '0px',
			borderBottomWidth: '0px',
		}
		const fallbackProps: Record<string, string> = {
			'line-height': '20px',
			'padding-top': '0px',
			'padding-bottom': '0px',
			'padding-left': '0px',
			'padding-right': '0px',
			'font-size': '14px',
			'border-top-width': '0px',
			'border-bottom-width': '0px',
		}
		return new Proxy(style, {
			get(target, prop, receiver) {
				if (prop === 'getPropertyValue') {
					return (name: string) => {
						const value = target.getPropertyValue(name)
						if (value) return value
						return fallbackProps[name] ?? ''
					}
				}
				if (typeof prop === 'string') {
					const value = Reflect.get(target, prop, receiver)
					if (typeof value === 'string' && value) return value
					if (prop in fallbackValues) return fallbackValues[prop]
				}
				return Reflect.get(target, prop, receiver)
			},
		})
	}) as typeof window.getComputedStyle
	Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
		configurable: true,
		get: () => 24,
	})
})

afterEach(() => {
	window.matchMedia = originalMatchMedia
	vi.restoreAllMocks()
})

afterAll(() => {
	window.getComputedStyle = originalGetComputedStyle
	if (scrollHeightDescriptor) {
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', scrollHeightDescriptor)
	} else {
		delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight
	}
})

function createApi(overrides: Record<string, unknown> = {}) {
	return {
		getBucketPolicy: vi.fn().mockResolvedValue({ bucket: 'demo-bucket', exists: true, policy: {} }),
		validateBucketPolicy: vi.fn(),
		putBucketPolicy: vi.fn(),
		deleteBucketPolicy: vi.fn(),
		...overrides,
	}
}

function mockViewportWidth(width: number) {
	window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => {
		const minMatch = query.match(/\(min-width:\s*(\d+)px\)/)
		const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/)
		let matches = true
		if (minMatch) matches &&= width >= Number(minMatch[1])
		if (maxMatch) matches &&= width <= Number(maxMatch[1])
		return {
			matches,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}
	})
}

function renderModal(
	api: ReturnType<typeof createApi>,
	options: {
		provider?: 'aws_s3' | 'gcp_gcs' | 'azure_blob'
	} = {},
) {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})

	render(
		<QueryClientProvider client={client}>
			<BucketPolicyModal
				api={api as never}
				apiToken="token"
				profileId="profile-1"
				provider={options.provider ?? 'aws_s3'}
				bucket="demo-bucket"
				onClose={vi.fn()}
			/>
		</QueryClientProvider>,
	)
}

describe('BucketPolicyModal', () => {
	it('renders the desktop modal shell by default', async () => {
		mockViewportWidth(1280)
		const api = createApi()

		renderModal(api)

		expect(await screen.findByTestId('bucket-policy-desktop-shell')).toBeInTheDocument()
		expect(screen.queryByTestId('bucket-policy-mobile-shell')).not.toBeInTheDocument()
	})

	it('renders GCS bindings as mobile cards on narrow screens', async () => {
		mockViewportWidth(390)
		const api = createApi({
			getBucketPolicy: vi.fn().mockResolvedValue({
				bucket: 'demo-bucket',
				exists: true,
				policy: {
					version: 3,
					etag: 'etag-123',
					bindings: [
						{
							role: 'roles/storage.objectViewer',
							members: ['allUsers'],
						},
					],
				},
			}),
		})

		renderModal(api, { provider: 'gcp_gcs' })

		expect(await screen.findByTestId('bucket-policy-mobile-shell')).toBeInTheDocument()
		expect(await screen.findByTestId('bucket-policy-gcs-mobile-bindings')).toBeInTheDocument()
		expect(screen.getByText('Binding 1')).toBeInTheDocument()
	})

	it('renders Azure stored access policies as mobile cards on narrow screens', async () => {
		mockViewportWidth(390)
		const api = createApi({
			getBucketPolicy: vi.fn().mockResolvedValue({
				bucket: 'demo-bucket',
				exists: true,
				policy: {
					publicAccess: 'blob',
					storedAccessPolicies: [
						{
							id: 'reader',
							start: '2024-01-01T00:00:00Z',
							expiry: '2024-02-01T00:00:00Z',
							permission: 'rl',
						},
					],
				},
			}),
		})

		renderModal(api, { provider: 'azure_blob' })

		expect(await screen.findByTestId('bucket-policy-mobile-shell')).toBeInTheDocument()
		expect(await screen.findByTestId('bucket-policy-azure-mobile-policies')).toBeInTheDocument()
		expect(screen.getByText('Stored access policy 1')).toBeInTheDocument()
	})

	it('shows validation warning details for ok=false provider responses', async () => {
		mockViewportWidth(1280)
		const api = createApi({
			validateBucketPolicy: vi.fn().mockResolvedValue({
				ok: false,
				provider: 'aws_s3',
				errors: ['Missing Principal'],
				warnings: ['Statement will be ignored'],
			}),
		})
		const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)

		renderModal(api)

		const validateButton = await screen.findByRole('button', { name: 'Validate with provider' })
		await act(async () => {
			fireEvent.click(validateButton)
		})

		await waitFor(() => expect(api.validateBucketPolicy).toHaveBeenCalled())
		await waitFor(() => {
			expect(warningSpy).toHaveBeenCalledWith(
				'Validation found issues (1 error(s) · 1 warning(s) · Missing Principal)',
				8,
			)
		})
	})

	it('shows unavailable validation errors for API failures', async () => {
		mockViewportWidth(1280)
		const api = createApi({
			validateBucketPolicy: vi.fn().mockRejectedValue(
				new APIError({
					status: 400,
					code: 'transfer_engine_missing',
					message: 'rclone is required to validate bucket policies (install it or set RCLONE_PATH)',
				}),
			),
		})
		const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		renderModal(api)

		const validateButton = await screen.findByRole('button', { name: 'Validate with provider' })
		await act(async () => {
			fireEvent.click(validateButton)
		})

		await waitFor(() => expect(api.validateBucketPolicy).toHaveBeenCalled())
		await waitFor(() => {
			expect(errorSpy).toHaveBeenCalledWith(
				'Policy validation unavailable: transfer_engine_missing: rclone is required to validate bucket policies (install it or set RCLONE_PATH) · Recommended action: Transfer engine (rclone) not found. Install rclone or set RCLONE_PATH on the server.',
				8,
			)
		})
		expect(await screen.findByText(/Policy validation unavailable:/)).toBeInTheDocument()
	})
})
