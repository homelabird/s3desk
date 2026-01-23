import { Form, Input, Modal } from 'antd'

import type { BucketCreateRequest, Profile } from '../../api/types'

export function BucketModal(props: {
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
