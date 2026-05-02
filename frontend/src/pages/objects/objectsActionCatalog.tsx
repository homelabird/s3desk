import { buildGlobalActions } from './objectsGlobalActionCatalog'
import { buildObjectActions } from './objectsObjectActionCatalog'
import { buildPrefixActions } from './objectsPrefixActionCatalog'
import { buildSelectionActions } from './objectsSelectionActionCatalog'
import type { ObjectsActionCatalog, ObjectsActionDeps } from './objectsActionCatalogTypes'

export type { ClipboardObjects, ObjectsActionCatalog, ObjectsActionDeps } from './objectsActionCatalogTypes'

export function buildObjectsActionCatalog(deps: ObjectsActionDeps): ObjectsActionCatalog {
	return {
		getObjectActions: (objectKey, objectSize) => buildObjectActions(deps, objectKey, objectSize),
		getPrefixActions: (targetPrefix) => buildPrefixActions(deps, targetPrefix),
		selectionActionsAll: buildSelectionActions(deps),
		globalActionsAll: buildGlobalActions(deps),
	}
}
