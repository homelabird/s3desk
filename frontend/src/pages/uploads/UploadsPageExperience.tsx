import { buildUploadsPagePresentationProps } from './buildUploadsPagePresentationProps'
import { UploadsPageShell } from './UploadsPageShell'
import { useUploadsPageState } from './useUploadsPageState'

type Props = {
	apiToken: string
	profileId: string
}

export function UploadsPageExperience(props: Props) {
	const state = useUploadsPageState(props)

	return <UploadsPageShell presentation={buildUploadsPagePresentationProps(state)} />
}
