# Paseo OfficeCLI

Preview and work with Word, Excel, and PowerPoint files without leaving [Paseo](https://github.com/getpaseo/paseo), powered by the official [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI).

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[![Checks](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml/badge.svg)](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml)
[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Features](#features) · [Installation](#installation) · [Usage](#usage) · [Safety](#safety) · [Development](#development)

<a id="features"></a>
## Features

- **Preview in the file panel.** Open `.docx`, `.xlsx`, and `.pptx` with OfficeCLI's HTML renderer, including worksheet switching and multi-slide browsing. Disk changes refresh the preview.
- **Edit Excel interactively.** Use the official watch page to edit cell text and drag charts, then save through OfficeCLI.
- **Reference Word and PowerPoint selections.** Attach snapshots of selected objects to the current workspace's conversation without sending a message automatically.
- **Use the full CLI when needed.** Advanced commands accept JSON argument arrays and stdin, with execution confirmation, stdout/stderr, live status, and stop controls. No shell and no fixed command whitelist.
- **Choose your language.** Follow Paseo or select English, Simplified Chinese, Traditional Chinese, or Japanese independently for the plugin.

> Word and PowerPoint interactive pages provide live preview and object selection, **not in-place text editing**. Use advanced commands, a Paseo agent, or the terminal for other edits.

<a id="requirements"></a>
## Requirements

| Component | Requirement |
| --- | --- |
| Paseo | **0.16.0-beta.1 or newer**, with trusted plugins enabled |
| OfficeCLI | Official stable release **1.0.160 or newer**, installed on the daemon's machine |
| Git | Available on the daemon's machine for the Git-source installation below |
| Client | Paseo desktop or a modern browser; native mobile Office preview is not supported |

OfficeCLI is installed and upgraded separately. This plugin does not bundle, fork, or pin its binary. Later stable versions depend on compatibility with the public CLI and watch interfaces; breaking upstream changes may require a plugin update.

<a id="installation"></a>
## Installation

1. Follow the [official OfficeCLI installation guide](https://github.com/iOfficeAI/OfficeCLI#installation) **on the machine running the Paseo daemon**, then verify:

   ```sh
   officecli --version
   ```

2. Review this plugin's source and host permissions. On the target daemon, open **Paseo Settings → Plugins** and turn on **Enable plugins**, then run these commands on that machine:

   ```sh
   paseo plugin install https://github.com/plumegod/paseo-officecli.git
   paseo plugin ls
   ```

   The plugin must report `running`. If it is missing or failed, check the target daemon and the global switch, then inspect `paseo plugin logs paseo-officecli`. This Git installation needs no `npm install` or separate build; Paseo supplies the runtime modules and compiles the source.

3. Open **Paseo Settings → Plugins → paseo-officecli → OfficeCLI** and confirm the detected executable and version. Only for a custom location, enter the executable's absolute path and save. Detection uses the daemon account's environment, which can differ from your terminal's. The plugin adds no sidebar workbench.
4. Open an Office file in the workspace tree, choose **OfficeCLI**, and select **Don't ask again** if you want to keep that choice. You can also set the default under **Settings → Files**. Other Office plugins do not need to be removed.

To update the plugin:

```sh
paseo plugin update paseo-officecli
```

This updates only the plugin. Upgrade OfficeCLI using its official instructions, recheck its path/version in plugin settings, and reopen interactive pages. See [discovery and upgrade details](docs/USAGE.md#officecli).

<a id="usage"></a>
## Usage

### Preview and interactive pages

Word and PowerPoint initially open in **Selection mode**; switch directly to **Reading mode** for read-only preview. Excel initially opens in **Reading mode**, with **Editing mode** available. The last choice is remembered separately for each file type on this client, including after reopening or restarting. Change it in the file toolbar or under **OfficeCLI → Document modes** in plugin settings. Interactive modes use OfficeCLI's own watch service and allow supported changes to the current original file.

Use **Save** to invoke the official save command; leaving the page is not a save or an undo. For Word and PowerPoint, select an object and choose **Reference selected objects** to prepare a conversation attachment. Snapshots include file paths and object content: review them before sending sensitive data to an AI.

### Advanced commands

Choose **Advanced commands** inside an open file. Enter a JSON string array **without** the `officecli` prefix, for example:

```json
["set", "draft.docx", "/body/p[1]", "--prop", "text=Updated from Paseo"]
```

Each item is one argument. Relative paths resolve from the current workspace; backslashes in Windows paths must be escaped as `\\`. Review the executable, working directory, arguments, and permissions in the confirmation dialog before running.

For batch or interactive protocols, expand the stdin section. Shell operators such as `|`, `&&`, and `>` are not interpreted. Use the current official help rather than guessing commands:

```json
["help"]
```

See the [usage guide](docs/USAGE.md) for batch input, output limits, stopping tasks, selection snapshots, and watch lifecycle details. The [sample files](examples/) are also used by integration tests.

<a id="language"></a>
## Interface language

Open **Paseo Settings → Plugins → paseo-officecli → OfficeCLI → Language**. The default is **Follow Paseo**; manual choices are English, 简体中文, 繁體中文, and 日本語.

The choice is local to this desktop/browser client and does not change Paseo's global language or daemon settings. Switching languages preserves drafts, tasks, output, selections, and interactive sessions. OfficeCLI commands, raw output, document content, and official pages are not translated. Host-rendered entry titles still follow Paseo's language.

<a id="safety"></a>
## Safety and limitations

- **Trusted host execution, not a filesystem sandbox.** Advanced commands run as the daemon's account and can access files outside the workspace, the network, or global configuration. Back up important files. Failure, stopping, or hitting a limit does **not** undo changes.
- **Preview and editing have different permissions.** Read-only preview does not change the original file. Interactive mode starts a local watch service and allows supported edits to that original file. Preview and interactive paths are checked against the real workspace boundary.
- **Untrusted documents remain untrusted.** Official HTML runs in an isolated iframe with only `allow-scripts`; external resources are blocked. This is not a complete document security sandbox or a network firewall. Do not follow untrusted document links.
- **Save deliberately.** The plugin does not change OfficeCLI's resident autosave policy, automatically save on exit, or close user-owned resident/watch services. A timed-out write may already have taken effect; inspect it before retrying.
- **Rendering is not Microsoft Office.** Legacy `.doc` / `.xls` / `.ppt`, encrypted files, and native mobile previews are unsupported. Remote fonts, formula libraries, and 3D resources are blocked; complex layouts may differ.

For exact limits and remote-access behavior, read [the usage guide](docs/USAGE.md). Report reproducible problems in [Issues](https://github.com/plumegod/paseo-officecli/issues), including Paseo/OfficeCLI versions and sanitized logs. Review [known issues](https://github.com/plumegod/paseo-officecli/issues/1) before reporting preview layout problems.

<a id="development"></a>
## Development

Use **Node.js 22.18 or newer**. Paseo provides the runtime SDK/client modules; the plugin has no additional runtime dependencies.

```sh
npm ci
npm run typecheck
npm test
npm run test:regression
npm run test:integration
```

The last two commands require an installed official OfficeCLI and fail if it is missing. Integration tests use temporary documents; the watch suite also exercises resident/save behavior and takes about two minutes. GitHub Actions runs typecheck and unit/policy/documentation/package tests on Windows, macOS and Linux, then checks OfficeCLI integration against checksum-pinned **1.0.160** binaries. It tests the supported baseline, not arbitrary future versions.

CI also installs the official `@getpaseo/cli@0.16.0-beta.1` into a temporary prefix and runs `npm run test:install`, with `PASEO_CLI_ENTRYPOINT` pointing to that package's `dist/index.js`. This installs the packed source with no plugin `node_modules`, verifies `running`, reloads, checks logs and removes the plugin in a separate loopback-only daemon. It never enables plugins on an existing daemon. `package.json` remains private: the supported release source is Git, not an unpublished npm package. Before sharing a revision, require all CI jobs to pass and test that exact Git revision on a test daemon.

For local installation, remove an existing installation source with the same plugin ID first, then:

```sh
paseo plugin install .
paseo plugin reload paseo-officecli
```

Read [AGENTS.md](AGENTS.md) and the [runtime internationalization contract](docs/I18N.md) before contributing. A request to change any README means updating **all three language files in the same change**; shared section anchors, links, version numbers, and command examples are checked by `npm test`, and CI rejects README changes that omit a language. Translation meaning still requires review.

<a id="license"></a>
## License

[MIT](LICENSE). This is an independent project, not an official Paseo or iOfficeAI product. OfficeCLI's own license is maintained in its [upstream repository](https://github.com/iOfficeAI/OfficeCLI); its binary is not distributed here.
