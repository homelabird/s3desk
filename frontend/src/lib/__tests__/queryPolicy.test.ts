import { describe, expect, it } from 'vitest'

import { getBucketsQueryStaleTimeMs } from '../queryPolicy'

describe('queryPolicy', () => {
	it('uses longer bucket cache windows for higher-cost providers', () => {
		expect(getBucketsQueryStaleTimeMs()).toBe(5 * 60 * 1000)
		expect(getBucketsQueryStaleTimeMs('s3_compatible')).toBe(5 * 60 * 1000)
		expect(getBucketsQueryStaleTimeMs('gcp_gcs')).toBe(10 * 60 * 1000)
		expect(getBucketsQueryStaleTimeMs('oci_object_storage')).toBe(15 * 60 * 1000)
	})
})
