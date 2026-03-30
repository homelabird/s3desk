import { describe, expect, it } from 'vitest'

import { buildQueuedUpload } from '../transfersQueuedUpload'

describe('buildQueuedUpload', () => {
	it('normalizes the destination bucket and prefix before queuing the upload task', () => {
		const result = buildQueuedUpload({
			taskId: 'upload-1',
			queueArgs: {
				profileId: 'profile-1',
				bucket: '  media-bucket  ',
				prefix: ' /incoming\\photos/./2024/ ',
				files: [new File(['hello'], 'demo.txt', { type: 'text/plain' })],
			},
		})

		expect(result?.task.bucket).toBe('media-bucket')
		expect(result?.task.prefix).toBe('incoming/photos/2024')
	})
})
