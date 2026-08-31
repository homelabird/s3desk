import { Alert, Button, Space, Typography } from 'antd'
import { Component, type ReactNode } from 'react'

import FullApp from './FullApp'
import styles from './FullAppInner.module.css'
import { BrandLockup } from './components/BrandLockup'
import { reloadPage } from './lib/reloadPage'

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		if (!this.state.failed) return this.props.children

		return (
			<div className={styles.fullscreenCenter}>
				<div className={styles.errorPanel}>
					<BrandLockup titleAs="h1" subtitle="Local Dashboard" variant="hero" />
					<Alert
						role="alert"
						type="error"
						showIcon
						title="S3Desk failed to load"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Typography.Text>The application hit an unexpected error. Reload to try again.</Typography.Text>
								<Button type="primary" onClick={reloadPage}>Reload</Button>
							</Space>
						}
					/>
				</div>
			</div>
		)
	}
}

export default function App() {
	return (
		<AppErrorBoundary>
			<FullApp />
		</AppErrorBoundary>
	)
}
