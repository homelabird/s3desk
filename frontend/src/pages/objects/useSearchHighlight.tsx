import { useCallback, useMemo, type ReactNode } from 'react'

import { normalizeForSearch } from './objectsListUtils'

export type SearchHighlightResult = {
	highlightPattern: RegExp | null
	highlightText: (value: string) => ReactNode
}

export function useSearchHighlight(searchTokens: string[]): SearchHighlightResult {
	const highlightPattern = useMemo(() => {
		if (searchTokens.length === 0) return null
		const uniqueTokens = Array.from(new Set(searchTokens.filter(Boolean))).slice(0, 8)
		if (uniqueTokens.length === 0) return null

		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const normalizedTokens = uniqueTokens.map((token) => normalizeForSearch(token)).filter(Boolean)
		const rawPatterns = uniqueTokens.map(escape)
		const loosePatterns = normalizedTokens.map((token) => token.split('').map(escape).join('[^\\p{L}\\p{N}]*'))
		const patterns = Array.from(new Set([...rawPatterns, ...loosePatterns])).filter(Boolean)
		if (patterns.length === 0) return null

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
							<span key={idx} style={{ background: '#fff1b8', paddingInline: 2, borderRadius: 2 }}>
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
