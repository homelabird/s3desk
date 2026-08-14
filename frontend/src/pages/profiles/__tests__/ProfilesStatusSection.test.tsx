import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
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
})
