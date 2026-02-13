import { describe, expect, it } from 'vitest'

import {
	formatLocalDateInputValue,
	localDayEndMsFromDateInput,
	localDayStartMsFromDateInput,
} from '../localDate'

describe('localDate', () => {
	it('parses date input into local day start and end milliseconds', () => {
		const start = localDayStartMsFromDateInput('2026-02-13')
		const end = localDayEndMsFromDateInput('2026-02-13')

		expect(start).not.toBeNull()
		expect(end).not.toBeNull()
		expect(start! < end!).toBe(true)

		const startDate = new Date(start!)
		const endDate = new Date(end!)

		expect(startDate.getFullYear()).toBe(2026)
		expect(startDate.getMonth()).toBe(1)
		expect(startDate.getDate()).toBe(13)
		expect(startDate.getHours()).toBe(0)
		expect(startDate.getMinutes()).toBe(0)
		expect(startDate.getSeconds()).toBe(0)
		expect(startDate.getMilliseconds()).toBe(0)

		expect(endDate.getFullYear()).toBe(2026)
		expect(endDate.getMonth()).toBe(1)
		expect(endDate.getDate()).toBe(13)
		expect(endDate.getHours()).toBe(23)
		expect(endDate.getMinutes()).toBe(59)
		expect(endDate.getSeconds()).toBe(59)
		expect(endDate.getMilliseconds()).toBe(999)
	})

	it('rejects invalid date strings and impossible calendar dates', () => {
		expect(localDayStartMsFromDateInput('')).toBeNull()
		expect(localDayStartMsFromDateInput('2026-2-13')).toBeNull()
		expect(localDayStartMsFromDateInput('2026-02-30')).toBeNull()
		expect(localDayEndMsFromDateInput('not-a-date')).toBeNull()
	})

	it('formats local date input values from epoch milliseconds', () => {
		const ms = new Date(2026, 1, 13, 10, 30, 25, 123).getTime()

		expect(formatLocalDateInputValue(ms)).toBe('2026-02-13')
		expect(formatLocalDateInputValue(null)).toBe('')
		expect(formatLocalDateInputValue(Number.NaN)).toBe('')
	})
})
