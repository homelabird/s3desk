import { appFeedback } from '../../lib/appFeedback'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import {
	formatUnavailableOperationMessage,
	formatValidationOperationMessage,
} from '../../lib/providerOperationFeedback'
import type { BucketPolicyValidateResponse } from '../../api/types'

export const bucketsFeedbackCopy = {
	bucketCreated: 'Bucket created',
	bucketDeleted: 'Bucket deleted',
	policySaved: 'Policy saved',
	policyDeleted: 'Policy deleted',
	policyValidationOk: 'Validation OK',
	policyValidationFoundIssues: 'Validation found issues',
	policyValidationUnavailable: 'Policy validation unavailable',
	invalidPolicyJson: 'Invalid policy JSON',
	invalidJsonPolicy: 'Invalid JSON policy',
	fixJsonErrorsFirst: 'Fix JSON errors first',
	fixLocalValidationIssuesFirst: 'Fix local validation issues first',
	secureDefaultsApplyFailed: (applySection: string) =>
		applySection
			? `Bucket created, but secure defaults failed while applying ${applySection}.`
			: 'Bucket created, but secure defaults were not fully applied.',
	bucketNotEmptyDismissed: (bucketName: string) =>
		`Bucket "${bucketName}" isn’t empty. Open Objects or create a delete job from the Buckets page.`,
}

export const bucketsFeedback = {
	bucketCreated() {
		appFeedback.success(bucketsFeedbackCopy.bucketCreated)
	},
	bucketDeleted() {
		appFeedback.success(bucketsFeedbackCopy.bucketDeleted)
	},
	policySaved() {
		appFeedback.success(bucketsFeedbackCopy.policySaved)
	},
	policyDeleted() {
		appFeedback.success(bucketsFeedbackCopy.policyDeleted)
	},
	policyValidationResult(resp: Pick<BucketPolicyValidateResponse, 'ok' | 'errors' | 'warnings'>) {
		const { content, duration } = formatValidationOperationMessage({
			successMessage: bucketsFeedbackCopy.policyValidationOk,
			failureMessage: bucketsFeedbackCopy.policyValidationFoundIssues,
			ok: resp.ok,
			errors: resp.errors,
			warnings: resp.warnings,
		})
		if (resp.ok) appFeedback.success(content, duration)
		else appFeedback.warning(content, duration)
	},
	policyValidationUnavailable(error: unknown) {
		const { content, duration } = formatUnavailableOperationMessage(
			bucketsFeedbackCopy.policyValidationUnavailable,
			error,
		)
		appFeedback.error(content, duration)
		return content
	},
	invalidPolicyJson(error?: string | null) {
		appFeedback.error(error ?? bucketsFeedbackCopy.invalidPolicyJson)
	},
	invalidJsonPolicy(error?: string | null) {
		appFeedback.error(error ?? bucketsFeedbackCopy.invalidJsonPolicy)
	},
	fixJsonErrorsFirst(error?: string | null) {
		appFeedback.error(error ?? bucketsFeedbackCopy.fixJsonErrorsFirst)
	},
	fixLocalValidationIssuesFirst(error?: string | null) {
		appFeedback.error(error ?? bucketsFeedbackCopy.fixLocalValidationIssuesFirst)
	},
	secureDefaultsApplyFailed(applySection: string) {
		appFeedback.warning(bucketsFeedbackCopy.secureDefaultsApplyFailed(applySection))
	},
	bucketNotEmptyDismissed(bucketName: string | null | undefined) {
		appFeedback.warning(bucketsFeedbackCopy.bucketNotEmptyDismissed(bucketName ?? ''))
	},
	error(error: unknown) {
		appFeedback.error(formatErr(error))
	},
}
