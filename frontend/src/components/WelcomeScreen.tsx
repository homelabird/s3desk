import type { CSSProperties, ReactNode } from 'react'

type StepItem = {
	icon: ReactNode
	title: string
	description: string
}

const steps: StepItem[] = [
	{
		icon: '①',
		title: 'Create a profile',
		description: 'A profile stores your storage endpoint and credentials (S3, Azure, GCS, etc.).',
	},
	{
		icon: '②',
		title: 'Browse buckets',
		description: 'List buckets, navigate folders, and preview objects.',
	},
	{
		icon: '③',
		title: 'Upload & transfer',
		description: 'Upload files, create sync/copy jobs, and track progress.',
	},
]

const cardStyle: CSSProperties = {
	border: '1px solid #e5e7eb',
	borderRadius: 12,
	padding: 20,
	background: '#fff',
}

const stepCardStyle: CSSProperties = {
	flex: '1 1 0',
	minWidth: 160,
	border: '1px solid #e5e7eb',
	borderRadius: 10,
	padding: 16,
	background: '#fafbfc',
	textAlign: 'center',
}

type Props = {
	onGetStarted: () => void
}

export function WelcomeScreen(props: Props) {
	return (
		<div style={cardStyle} data-testid="welcome-screen">
			<div style={{ textAlign: 'center' }}>
				<div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Welcome to S3Desk</div>
				<div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5, maxWidth: 480, margin: '0 auto' }}>
					A dashboard for managing cloud object storage.
					<br />
					Connect your S3, Azure, or GCS account and start browsing in minutes.
				</div>
			</div>

			<div style={{ height: 20 }} />

			<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
				{steps.map((step) => (
					<div key={step.title} style={stepCardStyle}>
						<div style={{ fontSize: 24, marginBottom: 8 }}>{step.icon}</div>
						<div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{step.title}</div>
						<div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>{step.description}</div>
					</div>
				))}
			</div>

			<div style={{ height: 20 }} />

			<div style={{ textAlign: 'center' }}>
				<button
					type="button"
					onClick={props.onGetStarted}
					data-testid="welcome-get-started"
					style={{
						border: '1px solid #1d4ed8',
						background: '#1d4ed8',
						color: '#fff',
						borderRadius: 10,
						padding: '10px 24px',
						fontWeight: 700,
						fontSize: 14,
						cursor: 'pointer',
					}}
				>
					Get started — Create your first profile
				</button>
			</div>
		</div>
	)
}
