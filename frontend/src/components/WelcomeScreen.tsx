import { useState, type CSSProperties, type ReactNode } from 'react'

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
	border: '1px solid var(--s3d-color-border)',
	borderRadius: 'var(--s3d-radius-lg)',
	padding: 28,
	background: 'var(--s3d-color-bg)',
	boxShadow: 'var(--s3d-shadow-sm)',
}

const stepCardStyle: CSSProperties = {
	flex: '1 1 0',
	minWidth: 160,
	border: '1px solid var(--s3d-color-border)',
	borderRadius: 'var(--s3d-radius-md)',
	padding: 20,
	background: 'var(--s3d-color-bg-secondary)',
	textAlign: 'center',
	transition: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
}

type Props = {
	onGetStarted: () => void
}

export function WelcomeScreen(props: Props) {
	const [hovered, setHovered] = useState(false)

	return (
		<div style={cardStyle} data-testid="welcome-screen">
			<div style={{ textAlign: 'center' }}>
				<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, marginTop: 0, color: 'var(--s3d-color-text-dark)' }}>Welcome to S3Desk</h2>
				<p style={{ fontSize: 14, color: 'var(--s3d-color-text-secondary)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
					A dashboard for managing cloud object storage.
					<br />
					Connect your S3, Azure, or GCS account and start browsing in minutes.
				</p>
			</div>

			<div style={{ height: 20 }} />

			<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
				{steps.map((step) => (
					<div key={step.title} style={stepCardStyle}>
						<div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden="true">{step.icon}</div>
						<div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--s3d-color-text-dark)' }}>{step.title}</div>
						<div style={{ fontSize: 13, color: 'var(--s3d-color-text-secondary)', lineHeight: 1.5 }}>{step.description}</div>
					</div>
				))}
			</div>

			<div style={{ height: 20 }} />

			<div style={{ textAlign: 'center' }}>
				<button
					type="button"
					onClick={props.onGetStarted}
					data-testid="welcome-get-started"
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
					style={{
						border: 'none',
						background: hovered ? 'var(--s3d-color-primary-hover)' : 'var(--s3d-color-primary-btn)',
						color: '#fff',
						borderRadius: '20px',
						padding: '10px 28px',
						fontWeight: 600,
						fontSize: 14,
						cursor: 'pointer',
						transition: 'background 150ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)',
						boxShadow: hovered ? 'var(--s3d-shadow-md)' : 'var(--s3d-shadow-sm)',
					}}
				>
					Get started — Create your first profile
				</button>
			</div>
		</div>
	)
}
