import { Spin } from 'antd'

import { JobQueueBanner } from './components/JobQueueBanner'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { FullAppRoutes, type FullAppRoutesProps } from './FullAppRoutes'
import styles from './FullAppInner.module.css'

export type FullAppContentHostProps = Omit<FullAppRoutesProps, 'loadingFallback'>

export function FullAppContentHost(props: FullAppContentHostProps) {
	return (
		<main
			id="main"
			tabIndex={-1}
			className={styles.mainScroll}
			data-scroll-container="app-content"
		>
			<div className={styles.stickyBanners}>
				<NetworkStatusBanner />
				<JobQueueBanner />
			</div>
			<FullAppRoutes
				{...props}
				loadingFallback={
					<div className={styles.loadingFallback} role="status" aria-live="polite" aria-label="Loading page">
						<Spin />
						<span className="sr-only">Loading page...</span>
					</div>
				}
			/>
		</main>
	)
}
