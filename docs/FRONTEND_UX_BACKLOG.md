# Frontend UX Backlog

This backlog tracks the next UI/UX passes for S3Desk after the recent storage, governance, and backup feature work.

## Priority 0

### 1. Objects media state polish

Scope:
- [ObjectThumbnail.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectThumbnail.tsx)
- [useObjectPreview.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectPreview.ts)
- [useObjectsScreenPreviewState.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectsScreenPreviewState.tsx)
- [useObjectsObjectGridRenderer.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/useObjectsObjectGridRenderer.tsx)
- [ObjectsListRowItems.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsListRowItems.tsx)
- [ObjectsImageViewerModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/objects/ObjectsImageViewerModal.tsx)

Problems:
- Thumbnail and preview failures are too quiet.
- `loading`, `failed`, `unsupported`, `too large`, and `deferred` are not visually distinct.
- Grid, list, details, and large preview do not use the same state vocabulary.

Execution checklist:
- [ ] Replace empty thumbnail placeholders with explicit loading/unavailable states
- [ ] Show concise inline reasons for blocked previews
- [ ] Use the same preview state wording in cards, details, and large preview
- [ ] Reduce global preview toasts in favor of local feedback

### 2. Settings information architecture

Scope:
- [SettingsPage.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/SettingsPage.tsx)
- [AccessSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/AccessSettingsSection.tsx)
- [ObjectsSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/ObjectsSettingsSection.tsx)
- [TransfersSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/TransfersSettingsSection.tsx)
- [NetworkSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/NetworkSettingsSection.tsx)
- [ServerSettingsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/settings/ServerSettingsSection.tsx)

Problems:
- Daily settings, operations, recovery, and diagnostics are mixed together.
- Backup and restore tools are too dense.
- Token handling and risky operations are not separated enough.

Execution checklist:
- [ ] Reframe settings tabs around actual operator workflows
- [ ] Split backup, restore, and staged restores into separate cards
- [ ] Remove surprising blur-apply interactions for critical fields
- [ ] Add one-line “what this affects” guidance at section tops

## Priority 1

### 3. Profile setup progressive disclosure

Scope:
- [ProfileModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/ProfileModal.tsx)
- [profileModalSectionContent.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx)
- [profileModalValidation.ts](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalValidation.ts)

Execution checklist:
- [ ] Separate required and advanced fields more aggressively
- [ ] Add provider-specific “required for basic connectivity” hints
- [ ] Collapse ARM/GCS/OCI advanced inputs by default

### 4. Upload fallback visibility

Scope:
- [useTransfersUploadRuntime.ts](/home/homelab/Downloads/project/s3desk/frontend/src/components/transfers/useTransfersUploadRuntime.ts)
- [presignedUpload.ts](/home/homelab/Downloads/project/s3desk/frontend/src/components/transfers/presignedUpload.ts)

Execution checklist:
- [ ] Show current upload mode per task
- [ ] Persist fallback reasons in task rows
- [ ] Make retry requirements explicit after resumable failures

## Priority 2

### 5. Bucket policy and governance simplification

Scope:
- [BucketModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketModal.tsx)
- [BucketPolicyModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketPolicyModal.tsx)
- [BucketGovernanceModal.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/buckets/BucketGovernanceModal.tsx)

Execution checklist:
- [ ] Add provider summary and irreversible-action badges
- [ ] Keep raw or advanced editors collapsed by default
- [ ] Separate “safe defaults” from “dangerous mutations”

## Current sequence

1. Objects media state polish
2. Settings information architecture
3. Profile setup progressive disclosure
4. Upload fallback visibility
5. Bucket policy and governance simplification
