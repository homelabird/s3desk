import { Button, Input } from 'antd'
import { useState } from 'react'

import type { BucketCreateRequest, Profile } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { FormField } from '../../components/FormField'

export function BucketModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (req: BucketCreateRequest) => void
	loading: boolean
	provider?: Profile['provider']
}) {
	const [name, setName] = useState('')
	const [region, setRegion] = useState('')

	const regionMeta = (() => {
		switch (props.provider) {
			case 'azure_blob':
				return { show: false, label: '', placeholder: '' }
			case 'gcp_gcs':
				return { show: true, label: 'Location (optional)', placeholder: 'us-central1' }
			default:
				return { show: true, label: 'Region (optional)', placeholder: 'us-east-1' }
		}
	})()

	const canSubmit = !!name.trim()
	const reset = () => {
		setName('')
		setRegion('')
	}
	const handleSubmit = () => {
		const trimmedName = name.trim()
		if (!trimmedName) return
		const trimmedRegion = region.trim()
		props.onSubmit({ name: trimmedName, region: trimmedRegion ? trimmedRegion : undefined })
	}
	const handleCancel = () => {
		reset()
		props.onCancel()
	}

	return (
		<DialogModal
			open={props.open}
			title="Create Bucket"
			onClose={handleCancel}
			footer={
				<>
					<Button onClick={handleCancel}>Cancel</Button>
					<Button type="primary" loading={props.loading} disabled={!canSubmit} onClick={handleSubmit}>
						Create
					</Button>
				</>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					handleSubmit()
				}}
			>
				<FormField label="Bucket name" required htmlFor="bucket-create-name">
					<Input
						id="bucket-create-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="my-bucket…"
						autoComplete="off"
					/>
				</FormField>

				{regionMeta.show ? (
					<FormField label={regionMeta.label} htmlFor="bucket-create-region">
						<Input
							id="bucket-create-region"
							value={region}
							onChange={(e) => setRegion(e.target.value)}
							placeholder={regionMeta.placeholder}
							autoComplete="off"
						/>
					</FormField>
				) : null}
			</form>
		</DialogModal>
	)
}
