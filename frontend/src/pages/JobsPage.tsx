import { JobsPageRouteShell } from './jobs/JobsPageRouteShell'
import { useJobsPageController } from './jobs/useJobsPageController'

type Props = {
	apiToken: string
	profileId: string | null
}

export function JobsPage(props: Props) {
	const controller = useJobsPageController(props)

	return (
		<JobsPageRouteShell
			apiToken={props.apiToken}
			profileId={props.profileId}
			shell={{
				api: controller.api,
				isOffline: controller.isOffline,
				hasOpenOverlay: controller.hasOpenOverlay,
				overlaysHost: controller.overlaysHost,
				presentation: controller.presentation,
			}}
		/>
	)
}
