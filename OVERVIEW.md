# OfficeCLI

Preview `.docx`, `.xlsx` and `.pptx` in Paseo's file panel using the official OfficeCLI renderer. Switch worksheets, browse slides and refresh when the file changes. Word and PowerPoint initially open in Selection mode; Excel initially opens in Reading mode. The last mode is remembered per file type on this client. The plugin adds a file panel and a settings screen, not a sidebar workbench.

## Setup

Requires Paseo **0.16.0-beta.1 or newer** with plugins enabled, and the official stable **OfficeCLI 1.0.160 or newer** on the daemon's machine. OfficeCLI provides Windows, macOS and Linux binaries; follow its [official installation instructions](https://github.com/iOfficeAI/OfficeCLI#installation). This plugin does not download, bundle, fork or update OfficeCLI. Native mobile Office previews are not supported; use Paseo desktop or a modern browser.

The executable is discovered automatically from the daemon's environment and the official per-user installation location. For a custom installation, save its absolute path under **Settings → Plugins → paseo-officecli → OfficeCLI**. Choose **OfficeCLI** when opening an Office file. Language and document-mode preferences are local to the client; the executable path is a daemon setting. After an OfficeCLI upgrade, use **Recheck** in plugin settings and reopen interactive pages. Later releases must remain compatible with the public CLI and watch interfaces; upstream breaking changes may require a plugin update.

## Preview, editing and commands

Reading mode is a read-only HTML preview. Excel's Editing mode uses the official watch page for cell-text edits and chart dragging on the current original file. Word and PowerPoint Selection mode provides live preview and object selection, not in-place text editing. **Save** invokes OfficeCLI's save command. Leaving the page does not save or undo a change, and the plugin does not change the resident's autosave policy.

For Word and PowerPoint, **Reference selected objects** prepares an attachment for the current workspace's conversation without sending a message. Snapshots include the document path and captured object content. They remain in plugin memory until eviction or unload and can reach your configured Agent Provider when you send the attachment. Review sensitive content before sending it.

**Advanced commands** accepts JSON argv and optional stdin. It shows the executable, working directory, arguments and permissions for confirmation before execution, then exposes stdout, stderr, exit status and stop controls. Arguments are passed without a shell or a fixed command whitelist. New official commands work when the public interfaces remain compatible. Text output is UTF-8 and limited to 16 MiB; binary exports should use OfficeCLI's file-output arguments. See the [usage guide](docs/USAGE.md) for limits and lifecycle details.

## Access and limitations

Server code and commands run as the daemon's account, outside a filesystem sandbox. Advanced commands can access files outside the workspace, the network and global configuration. Back up important files: failure, stopping or hitting a limit does not undo changes. Preview and interactive document paths are checked against the real workspace boundary. A timed-out write may already have taken effect; inspect it before retrying.

Official document HTML runs in an isolated iframe with only `allow-scripts`. External resources are blocked, including remote fonts, formula libraries and 3D resources. This is not a complete document-security sandbox or network firewall; do not follow untrusted document links. Rendering can differ from Microsoft Office. Legacy `.doc`, `.xls`, `.ppt` and encrypted documents are unsupported.

The plugin's watch service listens only on the daemon's loopback interface. Clients access it through Paseo RPC rather than connecting to a remote machine's localhost. The same file shares a plugin-owned watch; closing the last interactive page stops only that watch. Disconnected leases expire. The plugin does not take over or close user-owned watch/resident services. It does not upload documents on its own; explicit commands and attachments can send data according to the command or your Agent Provider configuration.
