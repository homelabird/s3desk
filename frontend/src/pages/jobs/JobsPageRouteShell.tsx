import { SetupCallout } from '../../components/SetupCallout'
import { JobsPageShell, type JobsPageShellProps } from './JobsPageShell'

export type JobsPageRouteShellProps = {
  apiToken: string
  profileId: string | null
  shell: Pick<JobsPageShellProps, 'api' | 'isOffline' | 'hasOpenOverlay' | 'overlaysHost' | 'presentation'>
}

export function JobsPageRouteShell(props: JobsPageRouteShellProps) {
  if (!props.profileId) {
    return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view jobs" />
  }

  return (
    <JobsPageShell
      api={props.shell.api}
      apiToken={props.apiToken}
      profileId={props.profileId}
      isOffline={props.shell.isOffline}
      hasOpenOverlay={props.shell.hasOpenOverlay}
      overlaysHost={props.shell.overlaysHost}
      presentation={props.shell.presentation}
    />
  )
}
