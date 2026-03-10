import { useCallback, useMemo, type ReactNode } from 'react'

import { normalizeForSearch } from './objectsListUtils'

export type SearchHighlightResult = {
	highlightPattern: RegExp | null
	highlightText: (value: string) => ReactNode
}

const MAX_HIGHLIGHT_TOKENS = 8
const MAX_HIGHLIGHT_TOKEN_LENGTH = 48
const MAX_HIGHLIGHT_PATTERN_LENGTH = 512

export function useSearchHighlight(searchTokens: string[]): SearchHighlightResult {
	const highlightPattern = useMemo(() => {
		if (searchTokens.length === 0) return null
		const uniqueTokens = Array.from(new Set(searchTokens.filter(Boolean).map((token) => token.slice(0, MAX_HIGHLIGHT_TOKEN_LENGTH)))).slice(0, MAX_HIGHLIGHT_TOKENS)
		if (uniqueTokens.length === 0) return null

		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const normalizedTokens = uniqueTokens.map((token) => normalizeForSearch(token)).filter(Boolean)
		const rawPatterns = uniqueTokens.map(escape)
		const loosePatterns = normalizedTokens.map((token) => token.split('').map(escape).join('[^\\p{L}\\p{N}]*'))
		const patterns = Array.from(new Set([...rawPatterns, ...loosePatterns])).filter(Boolean)
		if (patterns.length === 0) return null
		if (patterns.join('|').length > MAX_HIGHLIGHT_PATTERN_LENGTH) return null

		return new RegExp(`(${patterns.join('|')})`, 'giu')
	}, [searchTokens])

	const highlightText = useCallback(
		(value: string): ReactNode => {
			if (!value) return value
			if (!highlightPattern) return value

			const parts = value.split(highlightPattern)
			return (
				<span>
					{parts.map((part, idx) => {
						if (idx % 2 === 0) return <span key={idx}>{part}</span>
						return (
							<span key={idx} style={{ background: 'var(--s3d-color-highlight)', paddingInline: 2, borderRadius: 2 }}>
								{part}
							</span>
						)
					})}
				</span>
			)
		},
		[highlightPattern],
	)

	return { highlightPattern, highlightText }
}
