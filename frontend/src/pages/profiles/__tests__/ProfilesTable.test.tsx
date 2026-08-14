import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Profile } from '../../../api/types'
import type { ProfileTableRowViewModel } from '../profileViewModel'
import { ProfilesTable } from '../ProfilesTable'

const profile = {
	id: 'profile-1',
	name: 'Primary Profile',
	provider: 's3_compatible',
	endpoint: 'http://127.0.0.1:9000',
	region: 'us-east-1',
	preserveLeadingSlash: false,
	tlsInsecureSkipVerify: false,
	forcePathStyle: false,
	createdAt: '2026-03-29T00:00:00Z',
	updatedAt: '2026-03-29T00:00:00Z',
	validation: { valid: true, issues: [] },
} as Profile

const row: ProfileTableRowViewModel = {
	profile,
	providerLabel: 'S3 Compatible',
	connection: {
		primary: 'http://127.0.0.1:9000',
		secondary: 'us-east-1',
	},
	flags: [],
	isActive: false,
	needsAttention: false,
}

function renderTable(scopeKey: string, rows = [row]) {
	return render(
		<ProfilesTable
			scopeKey={scopeKey}
			rows={rows}
			onUseProfile={vi.fn()}
			onEdit={vi.fn()}
			onTest={vi.fn()}
			onBenchmark={vi.fn()}
			onOpenYaml={vi.fn()}
			onDelete={vi.fn()}
			isTestPending={false}
			testingProfileId={null}
			isBenchmarkPending={false}
			benchmarkingProfileId={null}
			isExportYamlPending={false}
			exportingProfileId={null}
			isDeletePending={false}
			deletingProfileId={null}
		/>,
	)
}

describe('ProfilesTable', () => {
	it('hides an uncontrolled row menu when the scope changes', () => {
		const { rerender } = renderTable('token-a')

		fireEvent.click(screen.getByRole('button', { name: 'Profile tools for Primary Profile' }))
		expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: /Diagnostics & export/ })).toBeInTheDocument()

		rerender(
			<ProfilesTable
				scopeKey="token-b"
				rows={[row]}
				onUseProfile={vi.fn()}
				onEdit={vi.fn()}
				onTest={vi.fn()}
				onBenchmark={vi.fn()}
				onOpenYaml={vi.fn()}
				onDelete={vi.fn()}
				isTestPending={false}
				testingProfileId={null}
				isBenchmarkPending={false}
				benchmarkingProfileId={null}
				isExportYamlPending={false}
				exportingProfileId={null}
				isDeletePending={false}
				deletingProfileId={null}
			/>,
		)

		expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
	})

	it('windows large compact profile lists', () => {
		renderTable(
			'token-a',
			Array.from({ length: 1_000 }, (_, index) => ({
				...row,
				profile: { ...profile, id: `profile-${index}`, name: `Profile ${index}` },
			})),
		)

		expect(screen.getAllByRole('listitem')).toHaveLength(10)
		expect(screen.getByText('Profile 0')).toBeInTheDocument()
		expect(screen.queryByText('Profile 999')).not.toBeInTheDocument()
	})

	it('renders short compact profile lists without measurement windowing', () => {
		renderTable(
			'token-a',
			Array.from({ length: 10 }, (_, index) => ({
				...row,
				profile: { ...profile, id: `profile-${index}`, name: `Profile ${index}` },
			})),
		)

		expect(screen.getAllByRole('listitem')).toHaveLength(10)
		expect(screen.getByText('Profile 9')).toBeInTheDocument()
	})
})
