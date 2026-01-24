import { Alert, AutoComplete, Button, Checkbox, Drawer, Form, Grid, Input, Space, Switch } from 'antd'
import { useEffect, useRef } from 'react'

export function DeletePrefixJobModal(props: {
	open: boolean
	onCancel: () => void
	onSubmit: (payload: {
		bucket: string
		prefix: string
		deleteAll: boolean
		allowUnsafePrefix: boolean
		include: string[]
		exclude: string[]
		dryRun: boolean
	}) => void
	loading: boolean
	isOffline: boolean
	bucket: string
	setBucket: (v: string) => void
	bucketOptions: { label: string; value: string }[]
	prefill?: { prefix: string; deleteAll: boolean } | null
}) {
	const screens = Grid.useBreakpoint()
	const drawerWidth = screens.md ? 520 : '100%'
	const [form] = Form.useForm<{
		bucket: string
		prefix: string
		deleteAll: boolean
		confirm: string
		unsafePrefixOk: boolean
		include: string
		exclude: string
		dryRun: boolean
	}>()
	const prevOpenRef = useRef(false)

	useEffect(() => {
		const wasOpen = prevOpenRef.current
		prevOpenRef.current = props.open
		if (!props.open || wasOpen) return
		if (!props.prefill) {
			form.resetFields()
			form.setFieldsValue({ bucket: props.bucket })
			return
		}
		form.setFieldsValue({
			bucket: props.bucket,
			prefix: props.prefill.prefix,
			deleteAll: props.prefill.deleteAll,
			confirm: '',
			unsafePrefixOk: false,
			include: '',
			exclude: '',
			dryRun: false,
		})
	}, [form, props.bucket, props.open, props.prefill])

	return (
		<Drawer
			open={props.open}
			onClose={props.onCancel}
			title="Create delete job (S3)"
			width={drawerWidth}
			extra={
				<Space>
					<Button onClick={props.onCancel}>Close</Button>
					<Button type="primary" danger loading={props.loading} onClick={() => form.submit()} disabled={props.isOffline}>
						Create
					</Button>
				</Space>
			}
		>
			<Alert
				type="warning"
				showIcon
				message="Dangerous operation"
				description="This job deletes remote objects via the transfer engine. It cannot be undone."
				style={{ marginBottom: 12 }}
			/>

			<Form
				form={form}
				layout="vertical"
				initialValues={{
					bucket: props.bucket,
					prefix: '',
					deleteAll: false,
					confirm: '',
					unsafePrefixOk: false,
					include: '',
					exclude: '',
					dryRun: false,
				}}
				onFinish={(values) => {
					const normalizedPrefix = values.prefix.trim().replace(/^\/+/, '')
					const unsafePrefix = !values.deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')

					props.setBucket(values.bucket)
					props.onSubmit({
						bucket: values.bucket.trim(),
						prefix: values.deleteAll ? '' : normalizedPrefix,
						deleteAll: values.deleteAll,
						allowUnsafePrefix: unsafePrefix,
						include: splitLines(values.include),
						exclude: splitLines(values.exclude),
						dryRun: values.dryRun,
					})
				}}
			>
				<Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
					<AutoComplete
						options={props.bucketOptions}
						filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
					>
						<Input placeholder="my-bucket…" />
					</AutoComplete>
				</Form.Item>

				<Form.Item name="deleteAll" label="Delete ALL objects in bucket" valuePropName="checked">
					<Switch />
				</Form.Item>

				<Form.Item shouldUpdate={(prev, cur) => prev.deleteAll !== cur.deleteAll} noStyle>
					{({ getFieldValue }) => {
						const deleteAll = getFieldValue('deleteAll')
						const prefix = (getFieldValue('prefix') ?? '') as string
						const normalizedPrefix = typeof prefix === 'string' ? prefix.trim().replace(/^\/+/, '') : ''
						const unsafePrefix = !deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')

						return (
							<>
								<Form.Item
									name="prefix"
									label="Prefix"
									dependencies={['deleteAll']}
									rules={[
										({ getFieldValue }) => ({
											validator: async (_, v: string) => {
												if (getFieldValue('deleteAll')) return
												const normalized = typeof v === 'string' ? v.trim().replace(/^\/+/, '') : ''
												if (!normalized) throw new Error('prefix is required unless deleteAll is enabled')
												if (normalized.includes('*')) throw new Error('wildcards are not allowed')
											},
										}),
									]}
								>
									<Input placeholder="path/…" disabled={deleteAll} />
								</Form.Item>

								{unsafePrefix ? (
									<>
										<Alert
											type="warning"
											showIcon
											message="Prefix does not end with '/'"
											description={
												"Without a trailing '/', delete will match keys with the prefix (e.g., 'abc' also matches 'abcd'). Prefer using a trailing '/'. To proceed anyway, acknowledge below."
											}
											style={{ marginBottom: 12 }}
										/>
										<Form.Item
											name="unsafePrefixOk"
											valuePropName="checked"
											dependencies={['prefix', 'deleteAll']}
											rules={[
												({ getFieldValue }) => ({
													validator: async (_, v: boolean) => {
														const deleteAll = getFieldValue('deleteAll')
														const prefix = (getFieldValue('prefix') ?? '') as string
														const normalizedPrefix = typeof prefix === 'string' ? prefix.trim().replace(/^\/+/, '') : ''
														const unsafePrefix = !deleteAll && normalizedPrefix !== '' && !normalizedPrefix.endsWith('/')
														if (!unsafePrefix) return
														if (v === true) return
														throw new Error('Acknowledge to proceed')
													},
												}),
											]}
										>
											<Checkbox>I understand and want to proceed</Checkbox>
										</Form.Item>
									</>
								) : null}

								{deleteAll ? (
									<Form.Item
										name="confirm"
										label='Type "DELETE" to confirm'
										rules={[
											{ required: true },
											{
												validator: async (_, v: string) => {
													if (v === 'DELETE') return
													throw new Error('Type DELETE to proceed')
												},
											},
										]}
									>
										<Input placeholder="DELETE…" />
									</Form.Item>
								) : null}
							</>
						)
					}}
				</Form.Item>

				<Form.Item name="dryRun" label="Dry run (no changes)" valuePropName="checked">
					<Switch />
				</Form.Item>

				<Form.Item name="include" label="Include patterns (one per line)">
					<Input.TextArea rows={4} placeholder="*.log…" />
				</Form.Item>
				<Form.Item name="exclude" label="Exclude patterns (one per line)">
					<Input.TextArea rows={4} placeholder="tmp_*…" />
				</Form.Item>
			</Form>
		</Drawer>
	)
}

function splitLines(v: string): string[] {
	return v
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}
