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
		originalConsoleError(...args)
		throw new Error(args.map(String).join(' '))
	})
})

afterEach(() => {
	const spy = console.error as unknown as { mockRestore?: () => void }
	if (spy.mockRestore) spy.mockRestore()
})
