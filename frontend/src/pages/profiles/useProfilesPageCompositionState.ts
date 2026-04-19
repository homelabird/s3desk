import type { ProfilesPageShellProps } from './ProfilesPageShell'
import { useProfilesPageState } from './useProfilesPageState'

type UseProfilesPageCompositionStateArgs = {
	apiToken: string
	profileId: string | null
	setProfileId: (value: string | null) => void
}

export type ProfilesPageCompositionState = {
	shell: ProfilesPageShellProps
}

export function useProfilesPageCompositionState(
	args: UseProfilesPageCompositionStateArgs,
): ProfilesPageCompositionState {
	return {
		shell: useProfilesPageState(args),
	}
}
