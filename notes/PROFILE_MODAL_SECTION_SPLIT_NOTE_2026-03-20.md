# `profileModalSectionContent` Split Note

## Summary

- The old [profileModalSectionContent.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionContent.tsx) file is now an export-only aggregator.
- Section ownership is split by responsibility instead of keeping one large mixed TSX file.

## New File Map

- [profileModalSectionShared.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSectionShared.tsx)
  - shared arg type
  - configured-count helper
  - connection summary helper
  - credential summary helper
  - advanced disclosure renderer
- [profileModalBasicConnectionSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalBasicConnectionSection.tsx)
  - provider/name
  - connection fields
  - provider-specific endpoint and setup hints
- [profileModalCredentialsSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalCredentialsSection.tsx)
  - provider auth inputs
  - temporary credential extras
  - OCI credential overrides
- [profileModalAdvancedSection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalAdvancedSection.tsx)
  - force path style
  - emulator toggle
  - slash preservation
  - TLS insecure skip verify
- [profileModalSecuritySection.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/profileModalSecuritySection.tsx)
  - mTLS status
  - mTLS action
  - PEM fields

## Result

- Section ownership is clearer.
- Future changes to one provider block or one security block no longer require editing a single large mixed file.
- [ProfileModalSections.tsx](/home/homelab/Downloads/project/s3desk/frontend/src/pages/profiles/ProfileModalSections.tsx) still imports from the aggregator path, so caller churn is avoided.

## Validation

- `npm run lint && npm run typecheck`
- targeted profiles tests:
  - `ProfilesPage.smoke.test.tsx`
  - `ProfilesPage.lazy.test.tsx`
  - `profileModalValidation.test.ts`
