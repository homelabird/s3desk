## Summary

- 

## Verification

Check only commands actually executed on this branch. If a box is marked `Not applicable`, explain why in the summary.

- [ ] `npm run test:e2e:core` executed
- [ ] `npm run test:e2e:mobile-responsive` executed for browser-facing layout, drawer, sheet, card, tab, or touch interaction changes
- [ ] `npm run test:e2e:mobile-responsive:settings-login` executed for targeted `Settings` or `Login` work
- [ ] Not applicable, with reason stated in the summary

## Mobile Responsive Checklist Review

Required when the change affects browser-facing layout, navigation, drawers, sheets, cards, forms, tabs, or touch interactions. Do not check an item unless the relevant page checklist was actually reviewed for this PR.

- [ ] [Objects checklist](frontend/docs/OBJECTS_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Objects` was touched
- [ ] [Jobs checklist](frontend/docs/JOBS_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Jobs` was touched
- [ ] [Uploads checklist](frontend/docs/UPLOADS_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Uploads` was touched
- [ ] [Profiles checklist](frontend/docs/PROFILES_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Profiles` was touched
- [ ] [Buckets checklist](frontend/docs/BUCKETS_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Buckets` was touched
- [ ] [Settings checklist](frontend/docs/SETTINGS_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Settings` was touched
- [ ] [Login checklist](frontend/docs/LOGIN_MOBILE_RESPONSIVE_CHECKLIST.md) reviewed if `Login` was touched
- [ ] [Suite-level mobile responsive guide](frontend/docs/MOBILE_RESPONSIVE_E2E.md) reviewed for frontend mobile-impacting work
- [ ] Not applicable, with reason stated in the summary

## Release Gate Notes

- [ ] [Release gate requirements](docs/RELEASE_GATE.md) reviewed when operator-facing, deployment-facing, auth-sensitive, or release-blocking behavior changed
- [ ] Not applicable, with reason stated in the summary
