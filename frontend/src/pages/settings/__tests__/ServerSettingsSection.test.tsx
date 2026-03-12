import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { APIClient } from '../../../api/client'
import type { MetaResponse } from '../../../api/types'
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

	it('renders operational warnings from the meta response', () => {
		const meta = {
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			dbBackend: 'sqlite',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				serverBackup: {
					export: { enabled: true, reason: '' },
					restoreStaging: { enabled: true, reason: '' },
				},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: {
				name: 'rclone',
				available: true,
				compatible: true,
				minVersion: 'v1.66.0',
				path: '/usr/local/bin/rclone',
				version: 'v1.66.0',
			},
			warnings: ['ALLOW_REMOTE is enabled but ALLOWED_LOCAL_DIRS is empty.'],
		} as MetaResponse & { warnings?: string[] }

		render(
			<ServerSettingsSection
				api={{} as APIClient}
				meta={meta}
				isFetching={false}
				errorMessage={null}
			/>,
		)

		expect(screen.getByText(/Operational warnings/i)).toBeInTheDocument()
		expect(screen.getByText(/ALLOW_REMOTE is enabled but ALLOWED_LOCAL_DIRS is empty/i)).toBeInTheDocument()
	})
})
