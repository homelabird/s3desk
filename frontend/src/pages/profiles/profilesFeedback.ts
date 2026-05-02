import type { ProfileBenchmarkResponse, ProfileTestResponse } from '../../api/types'
import { appFeedback } from '../../lib/appFeedback'
import { clipboardFailureHint } from '../../lib/clipboard'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	formatProviderOperationFailureMessage,
	formatUnavailableOperationMessage,
} from '../../lib/providerOperationFeedback'
import { formatBps } from './profileViewModel'

export const profilesFeedbackCopy = {
	profileCreated: 'Profile created',
	profileUpdated: 'Profile updated',
	profileDeleted: 'Profile deleted',
	profileTestOk: 'Profile test OK',
	profileTestFailed: 'Profile test failed',
	profileTestUnavailable: 'Profile test unavailable',
	benchmarkFailed: 'Benchmark failed',
	benchmarkUnavailable: 'Benchmark unavailable',
	profileYamlSaved: 'Profile YAML saved',
	copiedYaml: 'Copied YAML',
	downloadedYaml: 'Downloaded YAML',
	fixHighlightedFields: 'Fix the highlighted fields.',
	importedProfile: (name: string) => `Imported profile "${name}"`,
	mtlsUpdateFailed: (error: string) => `mTLS update failed: ${error}`,
	benchmarkOk: (parts: string[]) => `Benchmark OK: ${parts.join(' · ')}`,
}

function getProfileTestDetails(resp: ProfileTestResponse) {
	const storageType = resp.details?.storageType ?? ''
	const storageSource = resp.details?.storageTypeSource ?? ''
	const buckets = typeof resp.details?.buckets === 'number' ? resp.details.buckets : null
	const parts: string[] = []
	if (storageType) parts.push(`type: ${storageType}`)
	if (storageSource) parts.push(`source: ${storageSource}`)
	if (typeof buckets === 'number') parts.push(`buckets: ${buckets}`)
	return parts
}

function getBenchmarkDetails(resp: ProfileBenchmarkResponse) {
	const parts: string[] = []
	if (resp.uploadBps != null) parts.push(`↑ ${formatBps(resp.uploadBps)}`)
	if (resp.downloadBps != null) parts.push(`↓ ${formatBps(resp.downloadBps)}`)
	if (resp.uploadMs != null) parts.push(`upload ${resp.uploadMs}ms`)
	if (resp.downloadMs != null) parts.push(`download ${resp.downloadMs}ms`)
	return parts
}

export const profilesFeedback = {
	profileCreated() {
		appFeedback.success(profilesFeedbackCopy.profileCreated)
	},
	profileUpdated() {
		appFeedback.success(profilesFeedbackCopy.profileUpdated)
	},
	profileDeleted() {
		appFeedback.success(profilesFeedbackCopy.profileDeleted)
	},
	mtlsUpdateFailed(error: unknown) {
		appFeedback.error(profilesFeedbackCopy.mtlsUpdateFailed(formatErr(error)))
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
	errorMessage(error: unknown) {
		const message = formatErr(error)
		appFeedback.error(message)
		return message
	},
	profileTestResult(resp: ProfileTestResponse) {
		const details = getProfileTestDetails(resp)
		const suffix = details.length ? ` (${details.join(', ')})` : ''
		if (resp.ok) {
			appFeedback.success(`${profilesFeedbackCopy.profileTestOk}${suffix}`)
			return
		}
		const { content, duration } = formatProviderOperationFailureMessage({
			defaultMessage: profilesFeedbackCopy.profileTestFailed,
			message: resp.message,
			errorDetail: resp.details?.error,
			normalizedError: resp.details?.normalizedError,
			extraDetails: details,
		})
		appFeedback.warning(content, duration)
	},
	profileTestUnavailable(error: unknown) {
		const { content, duration } = formatUnavailableOperationMessage(
			profilesFeedbackCopy.profileTestUnavailable,
			error,
		)
		appFeedback.error(content, duration)
	},
	benchmarkResult(resp: ProfileBenchmarkResponse) {
		if (resp.ok) {
			appFeedback.success(profilesFeedbackCopy.benchmarkOk(getBenchmarkDetails(resp)), 8)
			return
		}
		const { content, duration } = formatProviderOperationFailureMessage({
			defaultMessage: profilesFeedbackCopy.benchmarkFailed,
			message: resp.message,
			errorDetail: resp.details?.error,
			normalizedError: resp.details?.normalizedError,
		})
		appFeedback.warning(content, duration)
	},
	benchmarkUnavailable(error: unknown) {
		const { content, duration } = formatUnavailableOperationMessage(
			profilesFeedbackCopy.benchmarkUnavailable,
			error,
		)
		appFeedback.error(content, duration)
	},
	profileYamlSaved() {
		appFeedback.success(profilesFeedbackCopy.profileYamlSaved)
	},
	importedProfile(name: string) {
		appFeedback.success(profilesFeedbackCopy.importedProfile(name))
	},
	copiedYaml() {
		appFeedback.success(profilesFeedbackCopy.copiedYaml)
	},
	downloadedYaml() {
		appFeedback.success(profilesFeedbackCopy.downloadedYaml)
	},
	clipboardFailed() {
		appFeedback.error(clipboardFailureHint())
	},
	fixHighlightedFields() {
		appFeedback.error(profilesFeedbackCopy.fixHighlightedFields)
	},
}
