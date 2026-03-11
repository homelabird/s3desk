import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { APIClient } from '../../../api/client'
import { ServerSettingsSection } from '../ServerSettingsSection'

describe('ServerSettingsSection', () => {
	it('shows the compatibility notice after moving backup tools to the sidebar', () => {
		render(
			<ServerSettingsSection
				api={{} as APIClient}
				meta={undefined}
				isFetching={false}
				errorMessage={null}
			/>,
		)

		expect(screen.getByText(/Backup and restore moved to the sidebar/i)).toBeInTheDocument()
		expect(screen.getByText(/The Operations tab has been removed/i)).toBeInTheDocument()
	})
})
