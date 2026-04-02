import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { CreateJobModal } from '../CreateJobModal'
import { JobsCreateModals } from '../JobsCreateModals'

vi.mock('../../../components/LocalDevicePathInput', () => ({
	LocalDevicePathInput: (props: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
		<input
			aria-label="Local destination folder"
			value={props.value}
			onChange={(event) => props.onChange(event.target.value)}
			placeholder={props.placeholder}
		/>
	),
}))

beforeAll(() => {
	ensureDomShims()
})

function setMatchMedia(matches: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation(() => ({
			matches,
			media: '(min-width: 768px)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}

describe('Jobs create modals state sync', () => {
	beforeEach(() => {
		setMatchMedia(true)
	})

	it('resets the upload modal when the active profile changes', async () => {
		const { rerender } = render(
			<CreateJobModal
				key="upload:token-a:profile-1:alpha-bucket"
				profileId="profile-1"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="alpha-bucket"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		fireEvent.change(screen.getByPlaceholderText('path/…'), { target: { value: 'stale/path' } })
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('stale/path')

		rerender(
			<CreateJobModal
				key="upload:token-a:profile-2:beta-bucket"
				profileId="profile-2"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="beta-bucket"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		expect(screen.getByRole('combobox', { name: 'Bucket' })).toHaveValue('beta-bucket')
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('')
		expect(screen.getByText('Nothing selected yet')).toBeInTheDocument()
	})

	it('resets the download modal when the active profile changes', async () => {
		const { rerender } = render(
			<JobsCreateModals
				apiToken="token-a"
				profileId="profile-1"
				createOpen={false}
				createDownloadOpen
				createDeleteOpen={false}
				onCloseCreate={vi.fn()}
				onCloseDownload={vi.fn()}
				onCloseDelete={vi.fn()}
				onSubmitCreate={vi.fn()}
				onSubmitDownload={vi.fn()}
				onSubmitDelete={vi.fn()}
				uploadLoading={false}
				downloadLoading={false}
				deleteLoading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="alpha-bucket"
				onBucketChange={vi.fn()}
				bucketOptions={[]}
				deleteBucket="alpha-bucket"
				deletePrefill={null}
			/>,
		)

		fireEvent.change(await screen.findByPlaceholderText('path/…'), { target: { value: 'downloads/2026' } })
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('downloads/2026')

		rerender(
			<JobsCreateModals
				apiToken="token-a"
				profileId="profile-2"
				createOpen={false}
				createDownloadOpen
				createDeleteOpen={false}
				onCloseCreate={vi.fn()}
				onCloseDownload={vi.fn()}
				onCloseDelete={vi.fn()}
				onSubmitCreate={vi.fn()}
				onSubmitDownload={vi.fn()}
				onSubmitDelete={vi.fn()}
				uploadLoading={false}
				downloadLoading={false}
				deleteLoading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="beta-bucket"
				onBucketChange={vi.fn()}
				bucketOptions={[]}
				deleteBucket="beta-bucket"
				deletePrefill={null}
			/>,
		)

		expect(await screen.findByRole('combobox', { name: 'Bucket' })).toHaveValue('beta-bucket')
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('')
	})

	it('refreshes delete prefill and bucket when delete context changes', async () => {
		const { rerender } = render(
			<JobsCreateModals
				apiToken="token-a"
				profileId="profile-1"
				createOpen={false}
				createDownloadOpen={false}
				createDeleteOpen
				onCloseCreate={vi.fn()}
				onCloseDownload={vi.fn()}
				onCloseDelete={vi.fn()}
				onSubmitCreate={vi.fn()}
				onSubmitDownload={vi.fn()}
				onSubmitDelete={vi.fn()}
				uploadLoading={false}
				downloadLoading={false}
				deleteLoading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="alpha-bucket"
				onBucketChange={vi.fn()}
				bucketOptions={[]}
				deleteBucket="alpha-bucket"
				deletePrefill={{ prefix: 'archive/', deleteAll: false }}
			/>,
		)

		fireEvent.change(await screen.findByRole('textbox', { name: 'Prefix' }), { target: { value: 'custom/' } })
		fireEvent.click(screen.getByRole('switch', { name: 'Dry run (no changes)' }))

		rerender(
			<JobsCreateModals
				apiToken="token-a"
				profileId="profile-2"
				createOpen={false}
				createDownloadOpen={false}
				createDeleteOpen
				onCloseCreate={vi.fn()}
				onCloseDownload={vi.fn()}
				onCloseDelete={vi.fn()}
				onSubmitCreate={vi.fn()}
				onSubmitDownload={vi.fn()}
				onSubmitDelete={vi.fn()}
				uploadLoading={false}
				downloadLoading={false}
				deleteLoading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="beta-bucket"
				onBucketChange={vi.fn()}
				bucketOptions={[]}
				deleteBucket="beta-bucket"
				deletePrefill={{ prefix: 'staging/', deleteAll: true }}
			/>,
		)

		expect(await screen.findByRole('combobox', { name: 'Bucket' })).toHaveValue('beta-bucket')
		expect(screen.getByRole('textbox', { name: 'Prefix' })).toHaveValue('staging/')
		expect(screen.getByRole('switch', { name: 'Delete ALL objects in bucket' })).toHaveAttribute('aria-checked', 'true')
		expect(screen.getByRole('switch', { name: 'Dry run (no changes)' })).toHaveAttribute('aria-checked', 'false')
	})

	it('resets the upload modal when the api token changes for the same profile', async () => {
		const { rerender } = render(
			<CreateJobModal
				key="upload:token-a:profile-1:alpha-bucket"
				profileId="profile-1"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="alpha-bucket"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		fireEvent.change(screen.getByPlaceholderText('path/…'), { target: { value: 'stale/path' } })
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('stale/path')

		rerender(
			<CreateJobModal
				key="upload:token-b:profile-1:alpha-bucket"
				profileId="profile-1"
				open
				onCancel={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
				isOffline={false}
				uploadSupported
				uploadUnsupportedReason={null}
				bucket="alpha-bucket"
				setBucket={vi.fn()}
				bucketOptions={[]}
			/>,
		)

		expect(screen.getByRole('combobox', { name: 'Bucket' })).toHaveValue('alpha-bucket')
		expect(screen.getByPlaceholderText('path/…')).toHaveValue('')
		expect(screen.getByText('Nothing selected yet')).toBeInTheDocument()
	})
})
