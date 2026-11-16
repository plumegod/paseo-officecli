# Project rules

## npm releases require per-release authorization

- The default delivery for an explicitly authorized release is one new public npm package, not a Git-source installation. Ordinary edits, commits and pushes do not authorize publication; each release needs fresh user permission.
- Unless the user specifies a version, increment the patch version in `package.json` and `package-lock.json`. Run typecheck, unit/policy tests, the official Paseo installation test and OfficeCLI integration tests before release. Commit all changes the user asked to include before packing.
- Pack the committed version once with `npm pack --ignore-scripts --pack-destination artifacts/releases --json` after creating that ignored directory. Inspect its contents, then publish that exact `.tgz` using `npm publish <tarball> --access public --registry=https://registry.npmjs.org/`. Do not rebuild a different artifact for publication or commit generated packages/logs.
- Verify the public version and artifact integrity, then verify installation through Paseo's official `npm:` source without Git. A dry run, upload acknowledgement or staged placeholder is not a published release. Inspect registry state before retrying an uncertain publication; never silently bump and publish another version under the same authorization.
- A release is complete only when the matching `v<version>` tag points to the released source commit and a published, non-draft GitHub Release exists with that exact npm `.tgz` attached. Verify the release and downloadable asset; a pushed branch or tag alone is not a GitHub Release. Completing a missing GitHub Release does not authorize another npm publication or version bump.
- Public release titles and notes are English-first: English is canonical, and optional translations follow it. Include official Paseo `npm:` installation/update commands, requirements, changes and the actual verification scope; never substitute Git-source installation instructions.
- Let the user complete npm/browser security challenges themselves. Never request passwords, OTPs or tokens in chat, weaken account security, or claim completion before public availability and installation are confirmed.

## README translations are one change

- `README.md` is the English baseline. `README.zh-CN.md` is the complete Simplified Chinese counterpart, not a summary.
- A user request to edit any README applies to both. Update the English baseline and the Chinese translation in the same patch without asking for separate translation requests. Do not finish with a stale language file or a placeholder translation.
- Keep language-switch links, section anchors/order, requirements, commands, links, feature claims, and safety boundaries aligned. Use the actual UI labels from `shared/locales.ts` when documenting controls. Shared technical examples stay verbatim; prose must be translated faithfully.
- Run `npm test` after changes. Documentation tests check shared anchors, links, versions, and fenced examples; CI also requires both README files in any README-changing patch. These checks cannot prove translation meaning: review both before declaring completion. Do not change unrelated text just to satisfy a file-count check.
- Keep the README focused on installation and use. Detailed operational limits belong in `docs/USAGE.md`; runtime translation policy belongs in `docs/I18N.md`. Do not add local logs, machine-specific screenshots, acceptance transcripts, credentials, or generated test output to Git. Keep test fixtures used by the suites.

## Internationalization is mandatory (Issue #8)

Read [docs/I18N.md](docs/I18N.md) before changing any runtime text, error, notification, accessibility name, contribution, or language behavior.

- All plugin-owned runtime language belongs to the **single catalog** in `shared/locales.ts` / `shared/error-messages.ts`. English is the baseline; en / zh-CN / zh-TW / ja and identical interpolation parameters are required for every new key. Language autonyms also live there.
- Components use `useOfficeTranslation()`. Host-rendered labels use deferred `messages.message()`. Server/shared code emits `message(code, values)`; the client renders it with `display`. Never hardcode UI prose, translate arbitrary stderr, add another translation framework/store, read navigator/system language, mutate global i18next/Paseo preferences, or branch components by language.
- Language state is client/plugin-local. Never put it in daemon settings. Never add locale to document/job query keys, component keys, or watch/execution effect dependencies. Changing language must preserve drafts, tasks, selections, output, leases and unsaved files.
- Official commands, argv/stdin/stdout/stderr, document content, paths, OS/SDK details and official HTML are data, not translation keys. Keep them verbatim. The snapshot's agent instruction is stable English from the catalog; snapshot JSON and metadata are not regenerated on language change.
- `npm test` includes the AST-based no-bypass policy, catalog completeness/interpolation checks, locale/preference tests, SDK deferred-label tests and state-preservation checks. New source files are included automatically. Do not disable, narrow, skip or work around these gates. No whole-file i18n exemptions for new features. Embedded protocol scripts are scanned too.
- Run `npm run typecheck`, `npm test`, and `npm run test:integration` for changes to these paths. Record real-host acceptance honestly; a mock or typecheck is not a real Paseo verification.

A change introducing untranslated plugin-owned runtime text or a second language path is **not complete and must not merge**. Exceptions for external data are boundaries, not permission to hide UI text in protocol modules or technical constants. New languages extend resources/mapping, never duplicate components.
