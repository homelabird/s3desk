import type { NormalizedError } from '../api/client'

import { getConnectionTroubleshootingHint } from './connectionHints'
import { describeError } from './errors'

// Shared UI feedback rules for APIs that return HTTP 2xx with an application-level ok flag.
export type OperationFeedback = {
	content: string
	duration: number
}

type ProviderOperationFailureArgs = {
	defaultMessage: string
	message?: string | null
	errorDetail?: string | null
	normalizedError?: Partial<NormalizedError> | null
	extraDetails?: Array<string | null | undefined>
}

type ValidationOperationArgs = {
	successMessage: string
	failureMessage: string
	ok: boolean
	errors?: string[] | null
	warnings?: string[] | null
}

export function formatProviderOperationFailureMessage(args: ProviderOperationFailureArgs): OperationFeedback {
	const normCode = typeof args.normalizedError?.code === 'string' ? args.normalizedError.code : ''
	const normRetryable = args.normalizedError?.retryable === true
	const detailParts = (args.extraDetails ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0)
	if (args.errorDetail) detailParts.push(`error: ${args.errorDetail}`)
	if (normCode) detailParts.push(`code: ${normCode}`)
	if (normRetryable) detailParts.push('retryable')
	const suffix = detailParts.length ? ` (${detailParts.join(', ')})` : ''
	const base = `${args.message ?? args.defaultMessage}${suffix}`
	const hint = normCode ? getConnectionTroubleshootingHint(normCode) : undefined
	return {
		content: hint ? `${base} · ${hint}` : base,
		duration: hint ? 8 : 5,
	}
}

export function formatUnavailableOperationMessage(label: string, err: unknown): OperationFeedback {
	const details = describeError(err)
	const base = `${label}: ${details.title}`
	return {
		content: details.hint ? `${base} · Recommended action: ${details.hint}` : base,
		duration: details.hint ? 8 : 5,
	}
}

export function formatValidationOperationMessage(args: ValidationOperationArgs): OperationFeedback {
	const errors = (args.errors ?? []).filter((value) => typeof value === 'string' && value.trim() !== '')
	const warnings = (args.warnings ?? []).filter((value) => typeof value === 'string' && value.trim() !== '')
	const countParts: string[] = []
	if (errors.length > 0) countParts.push(`${errors.length} error(s)`)
	if (warnings.length > 0) countParts.push(`${warnings.length} warning(s)`)
	const firstDetail = errors[0] ?? warnings[0] ?? ''
	const detailsParts = [...countParts]
	if (firstDetail) detailsParts.push(firstDetail)
	const base = args.ok ? args.successMessage : args.failureMessage
	return {
		content: detailsParts.length > 0 ? `${base} (${detailsParts.join(' · ')})` : base,
		duration: args.ok ? 5 : 8,
	}
}
