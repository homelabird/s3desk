import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import FullApp from '../FullApp'
import { ThemeModeProvider } from '../themeMode'

vi.mock('../FullAppInner', () => ({
	default: function FullAppInnerMock() {
		return <div>Full app shell</div>
	},
}))

vi.mock('@tanstack/react-query-devtools', () => ({
	ReactQueryDevtools: function ReactQueryDevtoolsMock() {
		return <button type="button">Query devtools</button>
	},
}))

describe('FullApp query devtools', () => {
	it('keeps the floating query devtools hidden unless explicitly enabled', () => {
		render(
			<ThemeModeProvider>
				<FullApp />
			</ThemeModeProvider>,
		)

		expect(screen.getByText('Full app shell')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Query devtools' })).not.toBeInTheDocument()
	})
})
