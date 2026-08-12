import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Profile } from '../../../api/types'
import { ProfilesStatusSection } from '../ProfilesStatusSection'

vi.mock('../ProfilesTable', () => ({
	ProfilesTable: () => <div data-testid="profiles-table" />,
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
})
