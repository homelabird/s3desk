import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { APIClientShape } from '../../../api/client'
import type { MetaResponse } from '../../../api/types'
import { ServerSettingsSection } from '../ServerSettingsSection'

describe('ServerSettingsSection', () => {
	it('shows backup tools in the advanced settings surface', () => {
		render(
			<ServerSettingsSection
				api={{} as APIClientShape}
				meta={undefined}
			/>,
		)

		expect(screen.getByRole('button', { name: 'Backup' })).toBeInTheDocument()
		expect(screen.getByText('Loading backup and restore status')).toBeInTheDocument()
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
				api={{} as APIClientShape}
				meta={meta}
			/>,
		)

		expect(screen.getByText(/Operational warnings/i)).toBeInTheDocument()
		expect(screen.getByText(/ALLOW_REMOTE is enabled but ALLOWED_LOCAL_DIRS is empty/i)).toBeInTheDocument()
	})
})
