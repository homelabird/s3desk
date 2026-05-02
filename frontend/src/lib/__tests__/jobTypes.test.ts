import { describe, expect, it } from 'vitest'

import { deleteSelectedObjectsLabel } from '../actionHints'
import { jobTypeLabel } from '../jobTypes'

describe('jobTypeLabel', () => {
	it('uses the shared delete-selected-objects label for s3 delete jobs', () => {
		expect(jobTypeLabel('s3_delete_objects')).toBe(deleteSelectedObjectsLabel())
	})
})
