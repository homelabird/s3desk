import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

if (typeof window !== 'undefined' && !window.matchMedia) {
	window.matchMedia = (query: string): MediaQueryList => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	})
}

const originalConsoleError = console.error

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		const rendered = args.map(String).join(' ')
		if (rendered.includes('not wrapped in act')) {
			return
		}
		originalConsoleError(...args)
		throw new Error(rendered)
	})
})

afterEach(() => {
	const spy = console.error as unknown as { mockRestore?: () => void }
	if (spy.mockRestore) spy.mockRestore()
})
