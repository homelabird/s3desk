import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureDomShims } from '../../../test/domShims'
import { BucketPolicyContentTabs } from '../BucketPolicyContentTabs'

const originalGetComputedStyle = window.getComputedStyle
const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')

const baseProps = {
	activeTab: 'preview' as const,
	setActiveTab: vi.fn(),
	parsed: { ok: true as const, error: null, value: {} },
	editorMode: 'json' as const,
	setEditorMode: vi.fn(),
	policyKind: 's3' as const,
	selectedPresetKey: undefined,
	setSelectedPresetKey: vi.fn(),
	selectedPresetDescription: null,
	policyPresets: [],
	applyPolicyPreset: vi.fn(),
	updateStructuredStateFromText: vi.fn(),
	resetServerValidationState: vi.fn(),
	policyText: '{}',
	setPolicyText: vi.fn(),
	formPolicyText: '{}',
	editorPlaceholder: '{}',
	structuredEditor: null,
	providerWarnings: [],
	hasBlockingValidationIssues: false,
	localValidationErrors: [],
	providerValidationHint: 'No provider-specific validation issues.',
	hasPolicyChanges: true,
	diffStats: { added: 1, removed: 0 },
	isBusy: false,
	onValidate: vi.fn(),
	validateLoading: false,
	serverValidation: null,
	serverValidationMessages: [],
	serverValidationError: null,
	lastProviderError: null,
	providerCause: null,
	providerError: null,
	previewText: '{\n  "Version": "2012-10-17"\n}',
	effectivePolicyText: '{}',
	showDiffContext: false,
	setShowDiffContext: vi.fn(),
	visibleDiffText: '+  "Version": "2012-10-17"',
}

describe('BucketPolicyContentTabs', () => {
	beforeAll(() => {
		ensureDomShims()
		window.getComputedStyle = ((element: Element, pseudoElt?: string) => {
			const style = originalGetComputedStyle(element, pseudoElt ? undefined : pseudoElt)
			const fallbackProps: Record<string, string> = {
				'line-height': '20px',
				'padding-top': '0px',
				'padding-bottom': '0px',
				'border-top-width': '0px',
				'border-bottom-width': '0px',
				'box-sizing': 'border-box',
			}
			return new Proxy(style, {
				get(target, prop, receiver) {
					if (prop === 'getPropertyValue') {
						return (name: string) => target.getPropertyValue(name) || fallbackProps[name] || ''
					}
					return Reflect.get(target, prop, receiver)
				},
			})
		}) as typeof window.getComputedStyle
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get: () => 240,
		})
	})

	afterAll(() => {
		window.getComputedStyle = originalGetComputedStyle
		if (scrollHeightDescriptor) {
			Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', scrollHeightDescriptor)
		} else {
			delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight
		}
	})

	it('names read-only preview and diff textareas for assistive technology', () => {
		const { rerender } = render(<BucketPolicyContentTabs {...baseProps} activeTab="validate" />)

		expect(screen.getByRole('textbox', { name: 'Raw policy JSON' })).toHaveValue(
			baseProps.policyText,
		)

		rerender(<BucketPolicyContentTabs {...baseProps} />)

		expect(screen.getByRole('textbox', { name: 'Policy preview' })).toHaveValue(
			baseProps.previewText,
		)

		rerender(<BucketPolicyContentTabs {...baseProps} activeTab="diff" />)

		expect(screen.getByRole('textbox', { name: 'Policy diff' })).toHaveValue(
			baseProps.visibleDiffText,
		)
	})
})
