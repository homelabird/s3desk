import type { AutoCompleteProps } from 'antd'
import { AutoComplete, Button, Input } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'

import { APIClient } from '../api/client'

type LocalPathInputProps = {
	api: APIClient
	profileId: string | null
	value?: string
	onChange?: (value: string) => void
	placeholder?: string
	disabled?: boolean
	onBrowse?: () => void
	browseDisabled?: boolean
}

type SuggestionParams = {
	basePath?: string
	filter: string
}

export function LocalPathInput(props: LocalPathInputProps) {
	const [options, setOptions] = useState<AutoCompleteProps['options']>([])
	const [loading, setLoading] = useState(false)
	const fetchIdRef = useRef(0)
	const debounceRef = useRef<number | null>(null)

	const fetchOptions = useCallback(
		async (raw: string) => {
			if (!props.profileId) {
				setOptions([])
				return
			}

			const { basePath, filter } = splitPathForSuggestions(raw)
			const requestId = ++fetchIdRef.current
			setLoading(true)
			try {
				const resp = await props.api.listLocalEntries({ profileId: props.profileId, path: basePath, limit: 300 })
				if (fetchIdRef.current !== requestId) return

				const needle = filter.trim().toLowerCase()
				const entries = resp.entries ?? []
				const filtered = needle
					? entries.filter((entry) => {
							const label = (entry.name || entry.path).toLowerCase()
							return label.includes(needle) || entry.path.toLowerCase().includes(needle)
						})
					: entries

				const next = filtered.map((entry) => ({
					value: entry.path,
					label: basePath ? entry.name || entry.path : entry.path,
				}))
				setOptions(next)
			} catch {
				if (fetchIdRef.current !== requestId) return
				setOptions([])
			} finally {
				if (fetchIdRef.current === requestId) setLoading(false)
			}
		},
		[props.api, props.profileId],
	)

	const scheduleFetch = useCallback(
		(raw: string) => {
			if (!props.profileId) return
			if (debounceRef.current) window.clearTimeout(debounceRef.current)
			debounceRef.current = window.setTimeout(() => {
				void fetchOptions(raw)
			}, 200)
		},
		[fetchOptions, props.profileId],
	)

	useEffect(() => {
		return () => {
			if (debounceRef.current) window.clearTimeout(debounceRef.current)
		}
	}, [])

	return (
		<AutoComplete
			value={props.value}
			options={options}
			onChange={(next) => props.onChange?.(String(next))}
			onSearch={(value) => scheduleFetch(value)}
			filterOption={false}
		>
			<Input
				placeholder={props.placeholder}
				disabled={props.disabled}
				onFocus={() => scheduleFetch(props.value ?? '')}
				suffix={loading ? <LoadingOutlined /> : undefined}
				addonAfter={
					props.onBrowse ? (
						<Button onClick={props.onBrowse} disabled={props.disabled || props.browseDisabled}>
							Browse…
						</Button>
					) : undefined
				}
			/>
		</AutoComplete>
	)
}

function splitPathForSuggestions(raw: string): SuggestionParams {
	const trimmed = raw.trim()
	if (!trimmed) return { basePath: undefined, filter: '' }

	const normalized = trimmed.replace(/\\/g, '/')
	if (normalized.endsWith('/')) {
		const base = normalized.replace(/\/+$/, '')
		if (!base || base === '/') return { basePath: undefined, filter: '' }
		return { basePath: base.startsWith('/') ? base : undefined, filter: '' }
	}

	const idx = normalized.lastIndexOf('/')
	if (idx <= 0) {
		const filter = idx === 0 ? normalized.slice(1) : normalized
		return { basePath: undefined, filter }
	}

	const base = normalized.slice(0, idx)
	const filter = normalized.slice(idx + 1)
	return { basePath: base.startsWith('/') ? base : undefined, filter }
}
