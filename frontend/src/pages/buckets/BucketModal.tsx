import { Alert, Button, Input } from 'antd'
import { useRef, useState } from 'react'

import type { BucketCreateRequest, Profile } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'
import { runIfActionIdle } from '../../lib/pendingActionGuard'
import { BucketCreateDefaultsSection } from './BucketCreateDefaultsSection'
import styles from './BucketModal.module.css'
import { buildBucketCreateDefaults } from './bucketCreateDefaultsBuild'
import { getBucketCreateRegionMeta, resetBucketCreateModalState } from './bucketCreateDefaultsState'
import {
	createInitialAWSDefaults,
	createInitialAzureDefaults,
	createInitialGCSDefaults,
} from './create/types'

export function BucketModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (req: BucketCreateRequest) => void
	loading: boolean
	provider?: Profile['provider']
}) {
	const [name, setName] = useState('')
	const [region, setRegion] = useState('')
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [awsDefaults, setAwsDefaults] = useState(createInitialAWSDefaults)
	const [gcsDefaults, setGcsDefaults] = useState(createInitialGCSDefaults)
	const [azureDefaults, setAzureDefaults] = useState(createInitialAzureDefaults)
	const keyCounter = useRef(0)
	const nextKey = () => {
		keyCounter.current += 1
		return `create-default-${keyCounter.current}`
	}

	const regionMeta = getBucketCreateRegionMeta(props.provider)

	const canSubmit = !!name.trim()
	const isBusy = props.loading

	const clearSubmitError = () => setSubmitError(null)

	const handleNameChange = (value: string) => {
		clearSubmitError()
		setName(value)
	}

	const handleRegionChange = (value: string) => {
		clearSubmitError()
		setRegion(value)
	}

	const submitRequest = (req: BucketCreateRequest) => {
		clearSubmitError()
		props.onSubmit(req)
	}

	const handleSubmit = () => {
		if (isBusy) return
		const trimmedName = name.trim()
		if (!trimmedName) return
		const trimmedRegion = region.trim()

		try {
			const defaults = buildBucketCreateDefaults({
				provider: props.provider,
				awsDefaults,
				gcsDefaults,
				azureDefaults,
			})
			submitRequest({
				name: trimmedName,
				region: trimmedRegion ? trimmedRegion : undefined,
				defaults,
			})
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : 'Invalid secure defaults')
		}
	}

	const handleCancel = () => {
		if (isBusy) return
		resetBucketCreateModalState({
			setName,
			setRegion,
			setSubmitError,
			setAwsDefaults,
			setGcsDefaults,
			setAzureDefaults,
		})
		runIfActionIdle(isBusy, props.onCancel)
	}

	const footer = (
		<>
			<Button onClick={handleCancel} disabled={isBusy}>Cancel</Button>
			<Button type="primary" loading={props.loading} disabled={isBusy || !canSubmit} onClick={handleSubmit}>
				Create
			</Button>
		</>
	)

	const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		handleSubmit()
	}

	return (
		<DialogModal
			open={props.open}
			title="Create Bucket"
			onClose={handleCancel}
			footer={footer}
		>
			<form className={styles.form} onSubmit={handleFormSubmit}>
				<FormField label="Bucket name" required htmlFor="bucket-create-name">
					<Input
						id="bucket-create-name"
						value={name}
						onChange={(e) => handleNameChange(e.target.value)}
						placeholder="my-bucket…"
						autoComplete="off"
					/>
				</FormField>

				{regionMeta.show ? (
					<FormField label={regionMeta.label} htmlFor="bucket-create-region">
						<Input
							id="bucket-create-region"
							value={region}
							onChange={(e) => handleRegionChange(e.target.value)}
							placeholder={regionMeta.placeholder}
							autoComplete="off"
						/>
					</FormField>
				) : null}

				{submitError ? <Alert type="error" showIcon title="Secure defaults are invalid" description={submitError} /> : null}

				<BucketCreateDefaultsSection
					provider={props.provider}
					awsDefaults={awsDefaults}
					onAwsDefaultsChange={setAwsDefaults}
					gcsDefaults={gcsDefaults}
					onGcsDefaultsChange={setGcsDefaults}
					azureDefaults={azureDefaults}
					onAzureDefaultsChange={setAzureDefaults}
					clearSubmitError={clearSubmitError}
					nextKey={nextKey}
				/>
			</form>
		</DialogModal>
	)
}
