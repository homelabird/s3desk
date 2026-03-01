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
	border: '1px solid var(--s3d-color-border-secondary)',
	borderRadius: 'var(--s3d-radius-lg)',
	padding: 20,
	background: 'var(--s3d-color-bg)',
}

const stepCardStyle: CSSProperties = {
	flex: '1 1 0',
	minWidth: 160,
	border: '1px solid var(--s3d-color-border-secondary)',
	borderRadius: 'var(--s3d-radius-md)',
	padding: 16,
	background: 'var(--s3d-color-bg-card)',
	textAlign: 'center',
}

type Props = {
	onGetStarted: () => void
}

export function WelcomeScreen(props: Props) {
	const [hovered, setHovered] = useState(false)

	return (
		<div style={cardStyle} data-testid="welcome-screen">
			<div style={{ textAlign: 'center' }}>
				<h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, marginTop: 0 }}>Welcome to S3Desk</h2>
				<p style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, maxWidth: 480, margin: '0 auto' }}>
					A dashboard for managing cloud object storage.
					<br />
					Connect your S3, Azure, or GCS account and start browsing in minutes.
				</p>
			</div>

			<div style={{ height: 20 }} />

			<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
				{steps.map((step) => (
					<div key={step.title} style={stepCardStyle}>
						<div style={{ fontSize: 24, marginBottom: 8 }} aria-hidden="true">{step.icon}</div>
						<div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{step.title}</div>
						<div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>{step.description}</div>
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
						border: '1px solid',
						borderColor: hovered ? 'var(--s3d-color-primary-hover)' : 'var(--s3d-color-primary-btn)',
						background: hovered ? 'var(--s3d-color-primary-hover)' : 'var(--s3d-color-primary-btn)',
						color: 'var(--s3d-color-bg)',
						borderRadius: 'var(--s3d-radius-md)',
						padding: '10px 24px',
						fontWeight: 700,
						fontSize: 14,
						cursor: 'pointer',
						transition: 'background 150ms ease, border-color 150ms ease',
					}}
				>
					Get started — Create your first profile
				</button>
			</div>
		</div>
	)
}
