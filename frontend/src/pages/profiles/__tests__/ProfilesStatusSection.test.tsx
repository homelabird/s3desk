import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Profile } from '../../../api/types'
import { ProfilesStatusSection } from '../ProfilesStatusSection'

vi.mock('../ProfilesTable', () => ({
	ProfilesTable: ({ rows }: { rows: unknown[] }) => <div data-testid="profiles-table" data-row-count={rows.length} />,
}))

const invalidProfiles = Array.from({ length: 20 }, (_, index) => ({
	id: `profile-${index}`,
	name: `Invalid Profile ${index}`,
	provider: 's3_compatible',
	endpoint: 'http://localhost:9000',
	region: 'us-east-1',
	forcePathStyle: true,
	preserveLeadingSlash: false,
	tlsInsecureSkipVerify: false,
	validation: { valid: false, issues: [{ field: 'endpoint', message: 'Update required' }] },
})) as Profile[]

function statusProps(overrides: Partial<ComponentProps<typeof ProfilesStatusSection>> = {}) {
	return {
		currentScopeKey: 'token:profile-0',
		profiles: [],
		profilesError: null,
		profilesNeedingAttention: [],
		profilesQueryIsFetching: false,
		onRetryProfiles: vi.fn(),
		showProfilesEmpty: false,
		tableRows: [],
		onUseProfile: vi.fn(),
		onEditProfile: vi.fn(),
		onTestProfile: vi.fn(),
		onBenchmarkProfile: vi.fn(),
		onOpenYaml: vi.fn(),
		onDeleteProfile: vi.fn(),
		isTestPending: false,
		testingProfileId: null,
		isBenchmarkPending: false,
		benchmarkingProfileId: null,
		isExportYamlPending: false,
		exportingProfileId: null,
		isDeletePending: false,
		deletingProfileId: null,
		onCreateProfile: vi.fn(),
		...overrides,
	}
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('ProfilesStatusSection', () => {
	it('summarizes large validation warning sets without duplicating the full profile list', () => {
		render(
			<ProfilesStatusSection
				currentScopeKey="token:profile-0"
				profiles={invalidProfiles}
				profilesError={null}
				profilesNeedingAttention={invalidProfiles}
				profilesQueryIsFetching={false}
				onRetryProfiles={vi.fn()}
				showProfilesEmpty={false}
				tableRows={[]}
				onUseProfile={vi.fn()}
				onEditProfile={vi.fn()}
				onTestProfile={vi.fn()}
				onBenchmarkProfile={vi.fn()}
				onOpenYaml={vi.fn()}
				onDeleteProfile={vi.fn()}
				isTestPending={false}
				testingProfileId={null}
				isBenchmarkPending={false}
				benchmarkingProfileId={null}
				isExportYamlPending={false}
				exportingProfileId={null}
				isDeletePending={false}
				deletingProfileId={null}
				onCreateProfile={vi.fn()}
			/>,
		)

		expect(screen.getByText('Profiles need updates (20)')).toBeInTheDocument()
		expect(screen.getAllByRole('button', { name: /Edit profile Invalid Profile/ })).toHaveLength(5)
		expect(screen.getByText('+15 more. Use the profile table below to review the remaining entries.')).toBeInTheDocument()
		expect(screen.getByTestId('profiles-table')).toBeInTheDocument()
	})

	it('renders initial rows after the first page paint', () => {
		vi.useFakeTimers()
		const frames: FrameRequestCallback[] = []
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.push(callback)
			return frames.length
		})

		render(
			<ProfilesStatusSection
				currentScopeKey="token:profile-0"
				profiles={[invalidProfiles[0]!]}
				profilesError={null}
				profilesNeedingAttention={[]}
				profilesQueryIsFetching={false}
				onRetryProfiles={vi.fn()}
				showProfilesEmpty={false}
				tableRows={[{} as never]}
				onUseProfile={vi.fn()}
				onEditProfile={vi.fn()}
				onTestProfile={vi.fn()}
				onBenchmarkProfile={vi.fn()}
				onOpenYaml={vi.fn()}
				onDeleteProfile={vi.fn()}
				isTestPending={false}
				testingProfileId={null}
				isBenchmarkPending={false}
				benchmarkingProfileId={null}
				isExportYamlPending={false}
				exportingProfileId={null}
				isDeletePending={false}
				deletingProfileId={null}
				onCreateProfile={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId('profiles-table')).not.toBeInTheDocument()
		act(() => frames.shift()?.(0))
		expect(screen.queryByTestId('profiles-table')).not.toBeInTheDocument()
		act(() => vi.runAllTimers())
		expect(screen.getByTestId('profiles-table')).toHaveAttribute('data-row-count', '1')
	})

	it('offers recovery for a failed initial query without suggesting an empty workspace', () => {
		const onRetryProfiles = vi.fn()
		render(<ProfilesStatusSection {...statusProps({ profilesError: new Error('Service unavailable'), onRetryProfiles })} />)

		expect(screen.getByText('Failed to load profiles')).toBeInTheDocument()
		expect(screen.getByText('Service unavailable')).toBeInTheDocument()
		expect(screen.queryByText('No profiles yet')).not.toBeInTheDocument()
		expect(screen.queryByTestId('profiles-table')).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Retry loading profiles' }))
		expect(onRetryProfiles).toHaveBeenCalledTimes(1)
	})

	it('keeps cached rows visible and disables repeated retries while recovery is pending', async () => {
		const props = statusProps({ profiles: [invalidProfiles[0]!], tableRows: [{} as never] })
		const { rerender } = render(<ProfilesStatusSection {...props} />)
		expect(await screen.findByTestId('profiles-table')).toHaveAttribute('data-row-count', '1')

		rerender(<ProfilesStatusSection {...props} profilesError={new Error('Service unavailable')} profilesQueryIsFetching />)
		const retry = screen.getByRole('button', { name: 'Retry loading profiles' })
		expect(retry).toBeDisabled()
		fireEvent.click(retry)
		expect(props.onRetryProfiles).not.toHaveBeenCalled()
		expect(screen.getByTestId('profiles-table')).toHaveAttribute('data-row-count', '1')
		expect(screen.queryByRole('status', { name: 'Loading profiles' })).not.toBeInTheDocument()
	})

	it('names the initial loading status', () => {
		render(<ProfilesStatusSection {...statusProps({ profilesQueryIsFetching: true })} />)
		expect(screen.getByRole('status', { name: 'Loading profiles' })).toHaveTextContent('Loading profiles...')
		expect(screen.queryByText('No profiles yet')).not.toBeInTheDocument()
	})
})
