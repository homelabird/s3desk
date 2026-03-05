import { ObjectsPageScreen } from './ObjectsPageScreen'

type Props = {
	apiToken: string
	profileId: string | null
}

export function ObjectsPage(props: Props) {
	return <ObjectsPageScreen {...props} />
}
