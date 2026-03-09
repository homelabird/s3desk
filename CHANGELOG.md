# Changelog

## Unreleased

### Added
- Added server backup download and staged restore flows for migration between hosts.
- Added provider capability coverage, route-to-OpenAPI contract tests, and expanded backend integration coverage.
- Added shared lightweight frontend primitives for dialogs, sheets, menus, toggles, and number fields.
- Added nightly/mock E2E workflows, live critical-flow coverage, and reusable Playwright fixture helpers.

### Changed
- Refactored the Objects, Profiles, Transfers, Jobs, and Uploads screens into smaller frontend modules.
- Reduced frontend bundle weight by replacing several Ant Design-heavy paths with lighter custom components and lazy-loaded sections.
- Updated the OpenAPI spec and generated frontend types to match runtime routes and metadata fields.

### Fixed
- Fixed frontend/backend contract drift around `/meta`, migration endpoints, and live API payload expectations.
- Fixed thumbnail preview accessibility and stabilized object action menus in list and grid views.
