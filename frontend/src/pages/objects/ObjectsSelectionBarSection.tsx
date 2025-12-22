import type { UIAction, UIActionOrDivider } from './objectsActions'
import { ObjectsSelectionBar } from './ObjectsSelectionBar'

type ObjectsSelectionBarSectionProps = {
	selectedCount: number
	singleSelectedKey: string | null
	singleSelectedSize?: number
	isAdvanced: boolean
	clearAction?: UIAction
	deleteAction?: UIAction
	downloadAction?: UIAction
	selectionMenuActions: UIActionOrDivider[]
	getObjectActions: (key: string, size?: number) => UIActionOrDivider[]
	isDownloadLoading: boolean
	isDeleteLoading: boolean
}

export function ObjectsSelectionBarSection(props: ObjectsSelectionBarSectionProps) {
	return (
		<ObjectsSelectionBar
			selectedCount={props.selectedCount}
			singleSelectedKey={props.singleSelectedKey}
			singleSelectedSize={props.singleSelectedSize}
			isAdvanced={props.isAdvanced}
			clearAction={props.clearAction}
			deleteAction={props.deleteAction}
			downloadAction={props.downloadAction}
			selectionMenuActions={props.selectionMenuActions}
			getObjectActions={props.getObjectActions}
			isDownloadLoading={props.isDownloadLoading}
			isDeleteLoading={props.isDeleteLoading}
		/>
	)
}
