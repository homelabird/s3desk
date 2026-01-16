import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Form, Input, Modal, Radio, Select, Space, Switch, Table, Tabs, Typography, message } from 'antd'
import { DeleteOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { BucketCreateRequest, BucketPolicyPutRequest, BucketPolicyResponse, BucketPolicyValidateResponse, Profile } from '../api/types'
import { SetupCallout } from '../components/SetupCallout'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { getProviderCapabilities } from '../lib/providerCapabilities'

type Props = {
	apiToken: string
	profileId: string | null
}

type PolicyKind = 's3' | 'gcs' | 'azure'

type ParsedPolicy =
	| { ok: true; error: null; value: Record<string, unknown> }
	| { ok: false; error: string; value: null }

const POLICY_TEMPLATES: Record<PolicyKind, string> = {
	s3: '{\n  "Version": "2012-10-17",\n  "Statement": []\n}',
	gcs: '{\n  "version": 1,\n  "bindings": []\n}',
	azure: '{\n  "publicAccess": "private",\n  "storedAccessPolicies": []\n}',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const parsePolicyText = (rawText: string): ParsedPolicy => {
	const raw = rawText.trim()
	if (raw === '') {
		return { ok: false, error: 'Policy is empty', value: null }
	}
	try {
		const value = JSON.parse(raw) as unknown
		if (!isRecord(value)) {
			return { ok: false, error: 'Policy must be a JSON object', value: null }
		}
		return { ok: true, error: null, value }
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error), value: null }
	}
}

export function BucketsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const navigate = useNavigate()

	const [createOpen, setCreateOpen] = useState(false)
	const [deletingBucket, setDeletingBucket] = useState<string | null>(null)
	const [policyBucket, setPolicyBucket] = useState<string | null>(null)

	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
		enabled: !!props.apiToken,
	})
	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((p) => p.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const capabilities = getProviderCapabilities(selectedProfile?.provider)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})
	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = !bucketsQuery.isFetching && buckets.length === 0

	const createMutation = useMutation({
		mutationFn: (req: BucketCreateRequest) => api.createBucket(props.profileId!, req),
		onSuccess: async () => {
			message.success('Bucket created')
			await queryClient.invalidateQueries({ queryKey: ['buckets'] })
			setCreateOpen(false)
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const deleteMutation = useMutation({
		mutationFn: (bucketName: string) => api.deleteBucket(props.profileId!, bucketName),
		onMutate: (bucketName) => setDeletingBucket(bucketName),
		onSuccess: async () => {
			message.success('Bucket deleted')
			await queryClient.invalidateQueries({ queryKey: ['buckets'] })
		},
		onSettled: (_, __, bucketName) => setDeletingBucket((prev) => (prev === bucketName ? null : prev)),
		onError: (err, bucketName) => {
			if (err instanceof APIError && err.code === 'bucket_not_empty') {
				Modal.confirm({
					title: `Bucket "${bucketName}" isn’t empty`,
					content: (
						<Space direction="vertical" style={{ width: '100%' }}>
							<Typography.Text>Only empty buckets can be deleted.</Typography.Text>
							<Typography.Text type="secondary">Browse the objects first or create a delete job to empty it.</Typography.Text>
							<Button
								type="link"
								onClick={() => {
									Modal.destroyAll()
									window.localStorage.setItem('bucket', JSON.stringify(bucketName))
									window.localStorage.setItem('prefix', JSON.stringify(''))
									navigate('/objects')
								}}
							>
								Open Objects
							</Button>
						</Space>
					),
					okText: 'Delete all objects (job)',
					okType: 'danger',
					cancelText: 'Close',
					onOk: async () => {
						window.localStorage.setItem('bucket', JSON.stringify(bucketName))
						navigate('/jobs', { state: { openDeleteJob: true, bucket: bucketName, deleteAll: true } })
					},
				})
				return
			}
			message.error(formatErr(err))
		},
	})

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view buckets" />
	}

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Buckets
				</Typography.Title>
				<Button type="primary" onClick={() => setCreateOpen(true)}>
					New Bucket
				</Button>
			</div>

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			<Table
				rowKey="name"
				loading={bucketsQuery.isFetching}
				dataSource={buckets}
				pagination={false}
				scroll={{ x: true }}
				locale={{
					emptyText: showBucketsEmpty ? (
						<Empty description="No buckets yet">
							<Button type="primary" onClick={() => setCreateOpen(true)}>
								Create bucket
							</Button>
						</Empty>
					) : null,
				}}
				columns={[
					{ title: 'Name', dataIndex: 'name' },
					{
						title: 'CreatedAt',
						dataIndex: 'createdAt',
						render: (v?: string) =>
							v ? (
								<Typography.Text code title={v}>
									{formatDateTime(v)}
								</Typography.Text>
							) : (
								'-'
							),
					},
					{
						title: 'Actions',
						render: (_, row: { name: string }) => (
							<Space wrap>
								{capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy ? (
									<Button
										size="small"
										icon={<FileTextOutlined />}
										onClick={() => {
											setPolicyBucket(row.name)
										}}
									>
										Policy
									</Button>
								) : null}

								<Button
									size="small"
									danger
									icon={<DeleteOutlined />}
									loading={deleteMutation.isPending && deletingBucket === row.name}
									onClick={() => {
										confirmDangerAction({
											title: `Delete bucket "${row.name}"?`,
											description: 'Only empty buckets can be deleted. If this fails, you can create a delete job to empty it.',
											confirmText: row.name,
											confirmHint: `Type "${row.name}" to confirm`,
											onConfirm: async () => {
												await deleteMutation.mutateAsync(row.name)
											},
										})
									}}
								>
									Delete
								</Button>
							</Space>
						),
					},
				]}
			/>

			<BucketModal
				open={createOpen}
				provider={selectedProfile?.provider}
				onCancel={() => setCreateOpen(false)}
				onSubmit={(req) => createMutation.mutate(req)}
				loading={createMutation.isPending}
			/>

			<BucketPolicyModal
				key={policyBucket ?? 'none'}
				api={api}
				apiToken={props.apiToken}
				profileId={props.profileId}
				provider={selectedProfile?.provider}
				bucket={policyBucket}
				onClose={() => setPolicyBucket(null)}
			/>
		</Space>
	)
}

function BucketModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (req: BucketCreateRequest) => void
	loading: boolean
	provider?: Profile['provider']
}) {
	const [form] = Form.useForm<{ name: string; region?: string }>()

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

	return (
		<Modal
			open={props.open}
			title="Create Bucket"
			okText="Create"
			okButtonProps={{ loading: props.loading }}
			onOk={() => form.submit()}
			onCancel={props.onCancel}
			destroyOnClose
		>
			<Form
				form={form}
				layout="vertical"
				initialValues={{ name: '', region: '' }}
				onFinish={(values) => {
					props.onSubmit({ name: values.name, region: values.region || undefined })
				}}
			>
				<Form.Item name="name" label="Bucket name" rules={[{ required: true }]}>
					<Input />
				</Form.Item>
				{regionMeta.show ? (
					<Form.Item name="region" label={regionMeta.label}>
						<Input placeholder={regionMeta.placeholder} />
					</Form.Item>
				) : null}
			</Form>
		</Modal>
	)
}

function BucketPolicyModal(props: {
	api: APIClient
	apiToken: string
	profileId: string
	provider?: Profile['provider']
	bucket: string | null
	onClose: () => void
}) {
	const open = !!props.bucket
	const bucket = props.bucket ?? ''

	const policyQuery = useQuery({
		queryKey: ['bucketPolicy', props.profileId, bucket, props.apiToken],
		queryFn: () => props.api.getBucketPolicy(props.profileId, bucket),
		enabled: open && !!props.profileId && !!bucket,
	})

	const policyKind: PolicyKind = useMemo(() => {
		switch (props.provider) {
			case 'gcp_gcs':
				return 'gcs'
			case 'azure_blob':
				return 'azure'
			default:
				return 's3'
		}
	}, [props.provider])

	if (!open) return null

	if (policyQuery.isError) {
		return (
			<Modal open={open} title={`Policy: ${bucket}`} onCancel={props.onClose} footer={null} width={920} destroyOnClose>
				<Alert type="error" showIcon message="Failed to load policy" description={formatErr(policyQuery.error)} />
			</Modal>
		)
	}

	if (!policyQuery.data) {
		return (
			<Modal open={open} title={`Policy: ${bucket}`} onCancel={props.onClose} footer={null} width={920} destroyOnClose>
				<Typography.Text type="secondary">Loading…</Typography.Text>
			</Modal>
		)
	}

	return (
		<BucketPolicyEditor
			api={props.api}
			apiToken={props.apiToken}
			profileId={props.profileId}
			bucket={bucket}
			policyKind={policyKind}
			policyData={policyQuery.data}
			policyIsFetching={policyQuery.isFetching}
			onClose={props.onClose}
		/>
	)
}

function BucketPolicyEditor(props: {
	api: APIClient
	apiToken: string
	profileId: string
	bucket: string
	policyKind: PolicyKind
	policyData: BucketPolicyResponse
	policyIsFetching: boolean
	onClose: () => void
}) {
	const queryClient = useQueryClient()
	const { bucket, policyKind, policyData } = props

	const baseText = policyData.policy ? JSON.stringify(policyData.policy, null, 2) : ''
	const originalText = baseText
	const initialPolicyText = policyData.exists ? baseText : POLICY_TEMPLATES[policyKind]
	const exists = !!policyData.exists

	const [policyText, setPolicyText] = useState(initialPolicyText)
	const [activeTab, setActiveTab] = useState<'validate' | 'preview' | 'diff'>('validate')
	const [lastProviderError, setLastProviderError] = useState<APIError | null>(null)

	// Editor mode: S3 stays JSON-only for now. GCS/Azure default to Form.
	const [editorMode, setEditorMode] = useState<'form' | 'json'>(policyKind === 's3' ? 'json' : 'form')

	const [serverValidation, setServerValidation] = useState<BucketPolicyValidateResponse | null>(null)
	const [serverValidationError, setServerValidationError] = useState<string | null>(null)

	// ----- Structured editor state (GCS) -----
	type GcsBindingRow = { key: string; role: string; members: string[] }

	// ----- Structured editor state (Azure) -----
	type AzureStoredPolicyRow = { key: string; id: string; start?: string; expiry?: string; permission?: string }

	const keyCounter = useRef(0)
	const nextKey = () => {
		keyCounter.current += 1
		return `k-${keyCounter.current}`
	}
	const initialParsed = parsePolicyText(initialPolicyText)
	const initialPolicyValue = initialParsed.ok ? initialParsed.value : null

	const initialGcsState = (() => {
		if (policyKind !== 'gcs' || !initialPolicyValue) {
			return { version: 1, etag: '', bindings: [] as GcsBindingRow[] }
		}
		const version = typeof initialPolicyValue.version === 'number' ? initialPolicyValue.version : 1
		const etag = typeof initialPolicyValue.etag === 'string' ? initialPolicyValue.etag : ''
		const bindingsRaw = Array.isArray(initialPolicyValue.bindings) ? initialPolicyValue.bindings : []
		const bindings: GcsBindingRow[] = bindingsRaw
			.filter(isRecord)
			.map((binding, index) => ({
				key: `gcs-${index}`,
				role: typeof binding.role === 'string' ? binding.role : '',
				members: Array.isArray(binding.members)
					? binding.members.filter((member): member is string => typeof member === 'string')
					: [],
			}))
		return { version, etag, bindings }
	})()

	const initialAzureState: { publicAccess: 'private' | 'blob' | 'container'; policies: AzureStoredPolicyRow[] } = (() => {
		if (policyKind !== 'azure' || !initialPolicyValue) {
			return { publicAccess: 'private' as const, policies: [] as AzureStoredPolicyRow[] }
		}
		const paRaw = typeof initialPolicyValue.publicAccess === 'string' ? initialPolicyValue.publicAccess : 'private'
		const pa = (String(paRaw).toLowerCase().trim() || 'private') as 'private' | 'blob' | 'container'
		const listRaw = Array.isArray(initialPolicyValue.storedAccessPolicies) ? initialPolicyValue.storedAccessPolicies : []
		const items: AzureStoredPolicyRow[] = listRaw
			.filter(isRecord)
			.map((policy, index) => ({
				key: `azure-${index}`,
				id: typeof policy.id === 'string' ? policy.id : '',
				start: typeof policy.start === 'string' ? policy.start : undefined,
				expiry: typeof policy.expiry === 'string' ? policy.expiry : undefined,
				permission: typeof policy.permission === 'string' ? policy.permission : undefined,
			}))
		return { publicAccess: pa === 'blob' || pa === 'container' ? pa : 'private', policies: items }
	})()

	const [gcsVersion, setGcsVersion] = useState<number>(initialGcsState.version)
	const [gcsEtag, setGcsEtag] = useState<string>(initialGcsState.etag)
	const [gcsBindings, setGcsBindings] = useState<GcsBindingRow[]>(initialGcsState.bindings)

	const [azurePublicAccess, setAzurePublicAccess] = useState<'private' | 'blob' | 'container'>(initialAzureState.publicAccess)
	const [azureStoredPolicies, setAzureStoredPolicies] = useState<AzureStoredPolicyRow[]>(initialAzureState.policies)

	const formPolicyText = useMemo(() => {
		if (policyKind === 'gcs') {
			const obj: Record<string, unknown> = {
				version: gcsVersion || 1,
				bindings: gcsBindings.map((b) => ({ role: b.role, members: b.members })),
			}
			if (gcsEtag.trim() !== '') obj.etag = gcsEtag.trim()
			return JSON.stringify(obj, null, 2)
		}
		if (policyKind === 'azure') {
			const obj: Record<string, unknown> = {
				publicAccess: azurePublicAccess,
				storedAccessPolicies: azureStoredPolicies.map((p) => ({
					id: p.id,
					start: p.start || undefined,
					expiry: p.expiry || undefined,
					permission: p.permission || undefined,
				})),
			}
			return JSON.stringify(obj, null, 2)
		}
		return policyText
	}, [policyKind, gcsVersion, gcsEtag, gcsBindings, azurePublicAccess, azureStoredPolicies, policyText])

	const effectivePolicyText = editorMode === 'form' && policyKind !== 's3' ? formPolicyText : policyText
	const parsed = useMemo(() => parsePolicyText(effectivePolicyText), [effectivePolicyText])

	const previewText = useMemo(() => {
		if (!parsed.ok) return ''
		try {
			return JSON.stringify(parsed.value, null, 2)
		} catch {
			return ''
		}
	}, [parsed])

	const providerWarnings = useMemo(() => {
		if (!parsed.ok) return [] as string[]
		const v = parsed.value
		const out: string[] = []
		if (policyKind === 'gcs') {
			// GCS IAM policy updates are safest when preserving the current policy's etag.
			if (typeof v.etag !== 'string' || v.etag.trim() === '') {
				out.push("GCS IAM policies usually include an 'etag'. Keep it (reload the policy if needed) to avoid update conflicts.")
			}
		}
		if (policyKind === 'azure') {
			const policies = v.storedAccessPolicies
			if (Array.isArray(policies) && policies.length > 5) {
				out.push('Azure allows a maximum of 5 stored access policies on a container. Reduce the list before saving.')
			}
		}
		return out
	}, [parsed, policyKind])

	const diffText = useMemo(() => {
		const from = (originalText ?? '').trimEnd()
		const to = (previewText || effectivePolicyText).trimEnd()
		return unifiedDiff(from, to)
	}, [originalText, previewText, effectivePolicyText])

	const putMutation = useMutation({
		mutationFn: (req: BucketPolicyPutRequest) => props.api.putBucketPolicy(props.profileId, bucket, req),
		onSuccess: async () => {
			message.success('Policy saved')
			setLastProviderError(null)
			await queryClient.invalidateQueries({ queryKey: ['bucketPolicy'] })
			props.onClose()
		},
		onError: (err) => {
			setActiveTab('validate')
			setLastProviderError(err instanceof APIError ? err : null)
			message.error(formatErr(err))
		},
	})

	const deleteMutation = useMutation({
		mutationFn: () => props.api.deleteBucketPolicy(props.profileId, bucket),
		onSuccess: async () => {
			message.success('Policy deleted')
			setLastProviderError(null)
			await queryClient.invalidateQueries({ queryKey: ['bucketPolicy'] })
			props.onClose()
		},
		onError: (err) => {
			setActiveTab('validate')
			setLastProviderError(err instanceof APIError ? err : null)
			message.error(formatErr(err))
		},
	})

	const validateMutation = useMutation({
		mutationFn: () => {
			if (!parsed.ok) throw new Error(parsed.error ?? 'Invalid policy JSON')
			return props.api.validateBucketPolicy(props.profileId, bucket, { policy: parsed.value } as BucketPolicyPutRequest)
		},
		onSuccess: (resp) => {
			setServerValidation(resp)
			setServerValidationError(null)
			if (resp.ok) message.success('Validation OK')
			else message.warning('Validation found issues')
		},
		onError: (err) => {
			setServerValidation(null)
			setServerValidationError(formatErr(err))
		},
	})

	const titleSuffix = useMemo(() => {
		if (policyKind === 'gcs') return ' (GCS IAM)'
		if (policyKind === 'azure') return ' (Azure container ACL)'
		return ''
	}, [policyKind])

	const deleteLabel = useMemo(() => {
		if (policyKind === 'azure') return 'Reset policy'
		return 'Delete policy'
	}, [policyKind])

	const deleteHelp = useMemo(() => {
		if (policyKind === 'azure') return 'This resets public access to private and removes all stored access policies.'
		return 'This removes the policy document from the bucket.'
	}, [policyKind])

	const canDelete = useMemo(() => {
		if (policyKind === 'gcs') return false
		if (policyKind === 'azure') return true
		return exists
	}, [policyKind, exists])

	const providerValidationHint = useMemo(() => {
		if (policyKind === 'gcs') return 'Provider-side validation happens on save (GCS IAM policy update).'
		if (policyKind === 'azure') return 'Provider-side validation happens on save (Azure Set Container ACL).'
		return 'Provider-side validation happens on save (S3 PutBucketPolicy).'
	}, [policyKind])

	const editorPlaceholder = POLICY_TEMPLATES[policyKind]

	const gcsPublicRead = useMemo(() => {
		return gcsBindings.some((b) => b.role === 'roles/storage.objectViewer' && b.members.includes('allUsers'))
	}, [gcsBindings])

	const updateStructuredStateFromText = (text: string) => {
		const nextParsed = parsePolicyText(text)
		if (!nextParsed.ok) return
		const v = nextParsed.value
		if (policyKind === 'gcs') {
			const version = typeof v.version === 'number' ? v.version : 1
			const etag = typeof v.etag === 'string' ? v.etag : ''
			const bindingsRaw = Array.isArray(v.bindings) ? v.bindings : []
			const bindings: GcsBindingRow[] = bindingsRaw
				.filter(isRecord)
				.map((binding) => ({
					key: nextKey(),
					role: typeof binding.role === 'string' ? binding.role : '',
					members: Array.isArray(binding.members)
						? binding.members.filter((member): member is string => typeof member === 'string')
						: [],
				}))
			setGcsVersion(version)
			setGcsEtag(etag)
			setGcsBindings(bindings)
		}

		if (policyKind === 'azure') {
			const paRaw = typeof v.publicAccess === 'string' ? v.publicAccess : 'private'
			const pa = (String(paRaw).toLowerCase().trim() || 'private') as 'private' | 'blob' | 'container'
			const listRaw = Array.isArray(v.storedAccessPolicies) ? v.storedAccessPolicies : []
			const items: AzureStoredPolicyRow[] = listRaw
				.filter(isRecord)
				.map((policy) => ({
					key: nextKey(),
					id: typeof policy.id === 'string' ? policy.id : '',
					start: typeof policy.start === 'string' ? policy.start : undefined,
					expiry: typeof policy.expiry === 'string' ? policy.expiry : undefined,
					permission: typeof policy.permission === 'string' ? policy.permission : undefined,
				}))
			setAzurePublicAccess(pa === 'blob' || pa === 'container' ? pa : 'private')
			setAzureStoredPolicies(items)
		}
	}

	const renderStructuredEditor = () => {
		if (policyKind === 'gcs') {
			return (
				<Space direction="vertical" style={{ width: '100%' }} size="middle">
					<Space align="center" wrap>
						<Switch
							checked={gcsPublicRead}
							onChange={(checked) => {
								setGcsBindings((prev) => {
									const next = prev.map((b) => ({ ...b, members: [...b.members] }))
									const role = 'roles/storage.objectViewer'
									if (checked) {
										const idx = next.findIndex((b) => b.role === role)
										if (idx === -1) {
											next.push({ key: nextKey(), role, members: ['allUsers'] })
										} else {
											if (!next[idx].members.includes('allUsers')) next[idx].members.push('allUsers')
										}
									} else {
										for (const b of next) {
											b.members = b.members.filter((m) => m !== 'allUsers')
										}
										return next.filter((b) => b.members.length > 0 || b.role.trim() !== '')
									}
									return next
								})
							}}
						/>
						<Typography.Text>
							Public read access (adds <Typography.Text code>allUsers</Typography.Text> to{' '}
							<Typography.Text code>roles/storage.objectViewer</Typography.Text>)
						</Typography.Text>
					</Space>

					{gcsEtag.trim() === '' ? (
						<Alert
							type="warning"
							showIcon
							message="etag missing"
							description="GCS IAM policy updates are safest when preserving etag. Reload policy before saving if you hit conflicts."
						/>
					) : (
						<Alert
							type="info"
							showIcon
							message="etag preserved"
							description={
								<Space direction="vertical" size={4} style={{ width: '100%' }}>
									<Typography.Text type="secondary">This value will be sent back on save.</Typography.Text>
									<Typography.Text code>{gcsEtag}</Typography.Text>
								</Space>
							}
						/>
					)}

					<Table
						size="small"
						rowKey="key"
						pagination={false}
						dataSource={gcsBindings}
						locale={{ emptyText: 'No bindings' }}
						columns={[
							{
								title: 'Role',
								dataIndex: 'role',
								render: (_: unknown, row: GcsBindingRow) => (
									<Input
										value={row.role}
										onChange={(e) => {
											const v = e.target.value
											setGcsBindings((prev) => prev.map((b) => (b.key === row.key ? { ...b, role: v } : b)))
										}}
										placeholder="roles/storage.objectViewer"
									/>
								),
							},
							{
								title: 'Members',
								render: (_: unknown, row: GcsBindingRow) => (
									<Select
										mode="tags"
										value={row.members}
										onChange={(vals: string[]) => {
											setGcsBindings((prev) => prev.map((b) => (b.key === row.key ? { ...b, members: vals } : b)))
										}}
										style={{ width: '100%' }}
										placeholder="allUsers, user:alice@example.com"
									/>
								),
							},
							{
								title: 'Actions',
								width: 90,
								render: (_: unknown, row: GcsBindingRow) => (
									<Button
										danger
										size="small"
										onClick={() => setGcsBindings((prev) => prev.filter((b) => b.key !== row.key))}
									>
										Remove
									</Button>
								),
							},
						]}
					/>

					<Button
						icon={<PlusOutlined />}
						onClick={() => setGcsBindings((prev) => [...prev, { key: nextKey(), role: '', members: [] }])}
					>
						Add binding
					</Button>
				</Space>
			)
		}

		if (policyKind === 'azure') {
			return (
				<Space direction="vertical" style={{ width: '100%' }} size="middle">
					<Space align="center" wrap>
						<Typography.Text strong>Public access:</Typography.Text>
						<Select
							value={azurePublicAccess}
							onChange={(v) => setAzurePublicAccess(v as 'private' | 'blob' | 'container')}
							options={[
								{ value: 'private', label: 'private' },
								{ value: 'blob', label: 'blob (public read for blobs)' },
								{ value: 'container', label: 'container (public read for container + blobs)' },
							]}
							style={{ width: 360 }}
						/>
					</Space>

					{azureStoredPolicies.length > 5 ? (
						<Alert type="warning" showIcon message="Azure supports at most 5 stored access policies" />
					) : null}

					<Table
						size="small"
						rowKey="key"
						pagination={false}
						dataSource={azureStoredPolicies}
						locale={{ emptyText: 'No stored access policies' }}
						columns={[
							{
								title: 'ID',
								width: 180,
								render: (_: unknown, row: AzureStoredPolicyRow) => (
									<Input
										value={row.id}
										onChange={(e) => {
											const v = e.target.value
											setAzureStoredPolicies((prev) => prev.map((p) => (p.key === row.key ? { ...p, id: v } : p)))
										}}
										placeholder="policy-id"
									/>
								),
							},
							{
								title: 'Start (RFC3339)',
								render: (_: unknown, row: AzureStoredPolicyRow) => (
									<Input
										value={row.start}
										onChange={(e) => {
											const v = e.target.value
											setAzureStoredPolicies((prev) => prev.map((p) => (p.key === row.key ? { ...p, start: v } : p)))
										}}
										placeholder="2026-01-14T00:00:00Z"
									/>
								),
							},
							{
								title: 'Expiry (RFC3339)',
								render: (_: unknown, row: AzureStoredPolicyRow) => (
									<Input
										value={row.expiry}
										onChange={(e) => {
											const v = e.target.value
											setAzureStoredPolicies((prev) => prev.map((p) => (p.key === row.key ? { ...p, expiry: v } : p)))
										}}
										placeholder="2026-01-15T00:00:00Z"
									/>
								),
							},
							{
								title: 'Perm',
								width: 120,
								render: (_: unknown, row: AzureStoredPolicyRow) => (
									<Input
										value={row.permission}
										onChange={(e) => {
											const v = e.target.value
											setAzureStoredPolicies((prev) => prev.map((p) => (p.key === row.key ? { ...p, permission: v } : p)))
										}}
										placeholder="rwdlacup"
									/>
								),
							},
							{
								title: 'Actions',
								width: 90,
								render: (_: unknown, row: AzureStoredPolicyRow) => (
									<Button
										danger
										size="small"
										onClick={() => setAzureStoredPolicies((prev) => prev.filter((p) => p.key !== row.key))}
									>
										Remove
									</Button>
								),
							},
						]}
					/>

					<Button
						icon={<PlusOutlined />}
						disabled={azureStoredPolicies.length >= 5}
						onClick={() =>
							setAzureStoredPolicies((prev) => [...prev, { key: nextKey(), id: '', start: '', expiry: '', permission: '' }])
						}
					>
						Add stored access policy
					</Button>

					<Typography.Text type="secondary">
						Permissions letters: r(read), w(write), d(delete), l(list), a(add), c(create), u(update), p(process)
					</Typography.Text>
				</Space>
			)
		}

		return null
	}

	const title = `Policy: ${bucket}${titleSuffix}`
	const details = lastProviderError?.details

	return (
		<Modal
			open
			title={title}
			onCancel={props.onClose}
			okText="Save"
			okButtonProps={{ loading: putMutation.isPending, disabled: !parsed.ok || props.policyIsFetching }}
			onOk={() => {
				if (!parsed.ok) {
					message.error(parsed.error ?? 'Invalid policy JSON')
					return
				}
				putMutation.mutate({ policy: parsed.value } as BucketPolicyPutRequest)
			}}
			footer={(_, { OkBtn, CancelBtn }) => (
				<Space style={{ width: '100%', justifyContent: 'space-between' }}>
					<Button
						danger
						disabled={!canDelete || deleteMutation.isPending || props.policyIsFetching}
						loading={deleteMutation.isPending}
						onClick={() => {
							confirmDangerAction({
								title: policyKind === 'azure' ? `Reset container access policy?` : `Delete bucket policy?`,
								description: deleteHelp,
								confirmText: 'delete',
								confirmHint: 'Type "delete" to confirm',
								onConfirm: async () => {
									await deleteMutation.mutateAsync()
								},
							})
						}}
					>
						{deleteLabel}
					</Button>

					<Space>
						<CancelBtn />
						<OkBtn />
					</Space>
				</Space>
			)}
			width={920}
			destroyOnClose
		>
			<Tabs
				activeKey={activeTab}
				onChange={(k) => setActiveTab(k as 'validate' | 'preview' | 'diff')}
				items={[
					{
						key: 'validate',
						label: 'Validate',
						children: (
							<Space direction="vertical" style={{ width: '100%' }} size="middle">
								{parsed.ok ? (
									<Alert type="success" showIcon message={editorMode === 'form' ? 'Valid policy (structured editor)' : 'Valid JSON policy'} />
								) : (
									<Alert type="error" showIcon message="Invalid JSON policy" description={parsed.error ?? 'Invalid JSON'} />
								)}

								{policyKind !== 's3' ? (
									<Space align="center" wrap>
										<Typography.Text type="secondary">Editor:</Typography.Text>
										<Radio.Group
											value={editorMode}
											onChange={(e) => {
												const next = e.target.value as 'form' | 'json'
												if (next === 'form') {
													if (!parsed.ok) {
														message.error(parsed.error ?? 'Fix JSON errors first')
														return
													}
													updateStructuredStateFromText(policyText)
													setEditorMode('form')
												} else {
													setPolicyText(formPolicyText)
													setEditorMode('json')
												}
												setServerValidation(null)
												setServerValidationError(null)
											}}
											optionType="button"
											buttonStyle="solid"
											options={[
												{ label: 'Form', value: 'form' },
												{ label: 'JSON', value: 'json' },
											]}
										/>
									</Space>
								) : null}

								{providerWarnings.length > 0 ? (
									<Alert type="warning" showIcon message="Provider-specific notes" description={providerWarnings.join('\n')} />
								) : null}

								{serverValidation ? (
									<Alert
										type={serverValidation.ok ? 'success' : 'error'}
										showIcon
										message={serverValidation.ok ? 'Server validation OK' : 'Server validation found issues'}
										description={
											<Space direction="vertical" size={4} style={{ width: '100%' }}>
												{serverValidation.errors?.length ? (
													<pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>{serverValidation.errors.join('\n')}</pre>
												) : null}
												{serverValidation.warnings?.length ? (
													<pre style={{ margin: 0, maxHeight: 140, overflow: 'auto' }}>{serverValidation.warnings.join('\n')}</pre>
												) : null}
											</Space>
										}
									/>
								) : null}

								{serverValidationError ? (
									<Alert type="error" showIcon message="Server validation failed" description={serverValidationError} />
								) : null}

								{lastProviderError ? (
									<Alert
										type="error"
										showIcon
										message="Provider rejected the policy"
										description={
											<Space direction="vertical" size={4} style={{ width: '100%' }}>
												<Typography.Text>
													Status: <Typography.Text code>{lastProviderError.status}</Typography.Text> / API code:{' '}
													<Typography.Text code>{lastProviderError.code}</Typography.Text>
												</Typography.Text>
												{lastProviderError.normalizedError ? (
													<Typography.Text>
														Normalized: <Typography.Text code>{lastProviderError.normalizedError.code}</Typography.Text> (
														{lastProviderError.normalizedError.retryable ? 'retryable' : 'not retryable'})
													</Typography.Text>
												) : null}
												{typeof lastProviderError.retryAfterSeconds === 'number' ? (
													<Typography.Text>
														Retry-After: <Typography.Text code>{lastProviderError.retryAfterSeconds}s</Typography.Text>
													</Typography.Text>
												) : null}

												{details ? (
													<>
														<Typography.Text>
															Upstream code: <Typography.Text code>{String(details['upstreamCode'] ?? '-')}</Typography.Text>{' '}
															RequestId: <Typography.Text code>{String(details['upstreamRequestId'] ?? '-')}</Typography.Text>{' '}
															HostId: <Typography.Text code>{String(details['upstreamHostId'] ?? '-')}</Typography.Text>
														</Typography.Text>
														<Typography.Text type="secondary">{String(details['upstreamError'] ?? '')}</Typography.Text>
														<pre style={{ margin: 0, maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(details, null, 2)}</pre>
													</>
												) : null}
											</Space>
										}
									/>
								) : null}

								<Space wrap>
									{editorMode === 'json' ? (
										<Button
											disabled={!parsed.ok}
											onClick={() => {
												if (!parsed.ok) return
												try {
													setPolicyText(JSON.stringify(parsed.value, null, 2))
												} catch {
													// ignore
												}
											}}
										>
											Format
										</Button>
									) : null}

									<Button disabled={!parsed.ok} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
										Validate (server)
									</Button>

									<Typography.Text type="secondary">
										We validate JSON shape and common mistakes. {providerValidationHint}
									</Typography.Text>
								</Space>

								{editorMode === 'form' && policyKind !== 's3' ? (
									renderStructuredEditor()
								) : (
									<Input.TextArea
										value={policyText}
										onChange={(e) => {
											setPolicyText(e.target.value)
											setServerValidation(null)
											setServerValidationError(null)
										}}
										autoSize={{ minRows: 12, maxRows: 22 }}
										placeholder={editorPlaceholder}
									/>
								)}
							</Space>
						),
					},
					{
						key: 'preview',
						label: 'Preview',
						children: parsed.ok ? (
							<pre style={{ margin: 0, maxHeight: 420, overflow: 'auto' }}>{previewText}</pre>
						) : (
							<Alert type="warning" showIcon message="Fix JSON errors first" description={parsed.error ?? 'Invalid JSON'} />
						),
					},
					{
						key: 'diff',
						label: 'Diff',
						children: (
							<Space direction="vertical" style={{ width: '100%' }} size="middle">
								<Typography.Text type="secondary">
									Diff is a simple line-based unified diff between the last loaded policy and your current edits.
								</Typography.Text>
								<pre style={{ margin: 0, maxHeight: 420, overflow: 'auto' }}>{diffText}</pre>
							</Space>
						),
					},
				]}
			/>
		</Modal>
	)
}

function unifiedDiff(fromText: string, toText: string): string {
	const a = fromText.split('\n')
	const b = toText.split('\n')

	const n = a.length
	const m = b.length

	// LCS DP
	const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
			else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
		}
	}

	const out: string[] = []
	let i = n
	let j = m
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
			out.push(` ${a[i - 1]}`)
			i--
			j--
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			out.push(`+${b[j - 1]}`)
			j--
		} else if (i > 0) {
			out.push(`-${a[i - 1]}`)
			i--
		}
	}

	out.reverse()

	// Remove empty leading context noise when both are empty.
	if (fromText.trim() === '' && toText.trim() === '') return ' (no changes)'

	return out.join('\n')
}
