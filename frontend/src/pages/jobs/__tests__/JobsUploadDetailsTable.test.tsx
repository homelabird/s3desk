import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { JobsUploadDetailsTable } from '../JobsUploadDetailsTable'

describe('JobsUploadDetailsTable', () => {
	it('renders truncation copy, pagination, and missing hash status', () => {
		const onPrev = vi.fn()
		const onNext = vi.fn()

		render(
			<JobsUploadDetailsTable
				uploadItemsCount={2}
				uploadItemsTruncated
				uploadTotalFiles={4}
				uploadTablePageItems={[
					{ key: 'a', path: 'folder/a.txt', size: 1024, etag: 'etag-a' },
					{ key: 'b', path: 'folder/b.txt', size: 2048, etag: null },
				]}
				uploadTableDataLength={4}
				uploadTablePageSize={2}
				uploadTablePageSafe={2}
				uploadTableTotalPages={3}
				onUploadTablePrevPage={onPrev}
				onUploadTableNextPage={onNext}
				jobStatus="succeeded"
				uploadHashesLoading={false}
				uploadHashFailures={1}
				borderColor="rgba(0,0,0,0.1)"
				backgroundColor="rgba(255,255,255,0.96)"
				borderRadius={14}
			/>,
		)

		expect(screen.getByText('Showing first 2 of 4 files.')).toBeInTheDocument()
		expect(screen.getByText('folder/a.txt')).toBeInTheDocument()
		expect(screen.getByText('etag-a')).toBeInTheDocument()
		expect(screen.getByText('Page 2 / 3')).toBeInTheDocument()
		expect(screen.getByText('1 file(s) missing hash data.')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
		fireEvent.click(screen.getByRole('button', { name: 'Next' }))

		expect(onPrev).toHaveBeenCalledTimes(1)
		expect(onNext).toHaveBeenCalledTimes(1)
	})
})
