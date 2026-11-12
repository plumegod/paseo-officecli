# Project rules

## README translations are one change

- `README.md` is the English baseline. `README.zh-CN.md` and `README.ja.md` are complete Simplified Chinese and Japanese counterparts, not summaries.
- A user request to edit any README applies to all three. Update the English baseline and both translations in the same patch without asking for separate translation requests. Do not finish with a stale language file or a placeholder translation.
- Keep language-switch links, section anchors/order, requirements, commands, links, feature claims, and safety boundaries aligned. Use the actual UI labels from `shared/locales.ts` when documenting controls. Shared technical examples stay verbatim; prose must be translated faithfully.
- Run `npm test` after changes. Documentation tests check shared anchors, links, versions, and fenced examples; CI also requires all three README files in any README-changing patch. These checks cannot prove translation meaning: review all three before declaring completion. Do not change unrelated text just to satisfy a file-count check.
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
