# Usage guide

[Back to the README](../README.md)

This guide covers the plugin's command and interactive-page boundaries. For the current command syntax and supported properties, use the [official OfficeCLI documentation](https://github.com/iOfficeAI/OfficeCLI) and the installed version's `help`. Examples are not a command whitelist.

<a id="officecli"></a>
## OfficeCLI discovery and upgrades

OfficeCLI must be installed on the Paseo daemon's machine. Discovery order:

1. Absolute executable path in the plugin's settings, without surrounding quotes.
2. The daemon's `OFFICECLI_PATH` environment variable.
3. The daemon's `PATH`.
4. Official default location: `%LOCALAPPDATA%\OfficeCLI\officecli.exe` on Windows, or `~/.local/bin/officecli` on macOS/Linux.

An invalid explicit path reports an error rather than silently falling back. The plugin checks the actual executable and version before starting commands, previews, or new watch services. Versions below **1.0.160** are blocked; an unrecognized version blocks automatic document operations but still allows confirmed advanced commands for diagnosis.

Help capabilities are cached for a path/version and refreshed by a manual recheck or path/version change. Failed or unfamiliar help is **unknown**, not proof that the installation is too old. Only explicitly missing capabilities disable corresponding automatic features; manual commands are not constrained to a cached command tree.

Upgrade manually using the [official installation instructions](https://github.com/iOfficeAI/OfficeCLI#installation). Then open **Paseo Settings → Plugins → paseo-officecli → OfficeCLI**, recheck the actual path/version, and correct a custom path if necessary. Reopen interactive pages and refresh previews. Running processes do not switch binaries mid-task. The plugin never downloads or replaces OfficeCLI in the background, forces a save for an upgrade, or closes user-owned residents.

## Advanced commands

Advanced commands live inside an open Office file, not in a separate workbench. The current file path is supplied by the document-structure shortcut. If you have no file yet, use the Paseo terminal to create one with the official CLI, then open it.

Enter a JSON string array without the `officecli` prefix. Each item becomes one argument; spaces require no extra shell quotes. Relative paths resolve from the workspace. Escape Windows backslashes as `\\`. Arguments are passed directly to the executable: `|`, `&&`, `>`, and `$(...)` are not shell operations.

| Task | Argument array |
| --- | --- |
| Help | `["help"]` or `["help", "set"]` |
| Structured capabilities | `["help", "all", "--json"]`; also check global and subcommand help |
| Create a file | `["create", "draft.docx"]`; `.xlsx` and `.pptx` are also supported |
| Add text | `["add", "draft.docx", "/body", "--type", "paragraph", "--prop", "text=Hello"]` |
| Read text | `["view", "draft.docx", "text"]` |
| Read structure/styles | `["get", "draft.docx", "/body/p[1]", "--json"]` |
| Find formulas | `["query", "book.xlsx", "cell:has(formula)", "--json"]` |
| Inspect problems | `["view", "draft.docx", "issues", "--json"]` or `["validate", "draft.docx"]` |
| Change formatting | `["set", "draft.docx", "/body/p[1]/r[1]", "--prop", "font=Calibri", "--prop", "color=1E2761"]` |
| Set a formula | `["set", "book.xlsx", "/Sheet1/C1", "--prop", "formula=SUM(A1:B1)"]` |
| Clone an element | `["add", "draft.docx", "/body", "--from", "/body/p[1]"]` |
| Move an element | `["move", "draft.docx", "/body/p[2]", "--index", "0"]` |
| Remove an element | `["remove", "draft.docx", "/body/p[2]"]` |
| Save | `["save", "draft.docx"]` |

Official `open`, `close`, `watch`, `unwatch`, `mcp`, `plugins`, `skills`, and `install` commands are not blocked. They may start services, access the network, or change global configuration. The confirmation dialog is a permission warning, not a filesystem sandbox.

### Batch input and cross-document content

Run `["batch", "book.xlsx"]` and enter official JSON in the stdin section:

```json
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"12"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"30"}},
  {"command":"set","path":"/Sheet1/C1","props":{"formula":"SUM(A1:B1)"}}
]
```

By default, stdin closes after the input is sent. Batch defaults and options such as `--best-effort` depend on the installed official version. Do not generalize batch transaction behavior to other commands. Nonzero exit, process termination, or exceeding a limit is **not rollback**. The plugin does not append `--force`, save, retry, or other arguments.

For cross-document reconstruction, use `["dump", "source.docx", "/body"]`, copy the full stdout, then feed that JSON to `["batch", "target.docx"]` after creating the target file. A subtree dump does not necessarily include all required styles, resources, or workbook settings. For full reconstruction, follow the official root-level dump and format instructions.

### Tasks, output, and stopping

- One running command per workspace; the most recent job is retained. At most eight workspace jobs are retained, evicting completed jobs first.
- Status is polled every second while running. Leaving the command panel does not stop a task. History is not durable across daemon restarts.
- Advanced commands have **no fixed timeout**. Enable **Keep input open** to send more stdin or **End input (EOF)**, including for official MCP stdio. Supply protocol newlines yourself.
- **Stop command**, plugin reload, or disable terminates plugin-started foreground processes. It does not undo changes or close detached official resident/watch services. Manage those with official `close` / `unwatch` commands.
- stdout/stderr are separate, with exit code and process signal. **Copy full output** copies the selected stream retained within the output cap. Nonzero exit is not displayed as success.
- Text is UTF-8 over pipes, not a TTY. Use the Paseo terminal for commands requiring a real terminal. Export binary PDF/PNG data using official file-output options, not copied text stdout.

| Limit | Value |
| --- | --- |
| argv and each stdin submission | 1 Mi characters each; at most 1024 argv items; NUL is rejected |
| Pending stdin queue | 4 MiB |
| Combined stdout + stderr | 16 MiB; exceeding this stops the process with a warning |
| Displayed output | First 200000 characters per stream; copy can retrieve the full retained stream |
| Read-only preview | 60 seconds and 16 MiB output per request |

## Official interactive pages

The plugin embeds official `watch <file> --port 0` HTML and scripts. It does not implement a replacement spreadsheet or a simulated editable page. Interactive behavior has been exercised with **OfficeCLI 1.0.160**; later versions require compatible public protocols.

| Format | Supported interaction |
| --- | --- |
| `.xlsx` | Double-click a cell to edit text; Enter/blur submits and Escape cancels. Drag charts to change their anchors. Changes affect the current original file. |
| `.docx` / `.pptx` | Live preview and object selection; no in-place text editing. Use advanced commands for text changes. |

**Save** invokes only `save <current file> --json`. The plugin checks the official inner JSON result as well as HTTP success before reporting a save. It does not automatically retry failed writes. **Reload** reopens the official page. After an error or timeout, inspect the file before retrying an operation that may already have been applied.

OfficeCLI resident behavior, including `OFFICECLI_RESIDENT_FLUSH`, is unchanged. Opening an interactive page does not prove existing resident edits are on disk. Leaving it neither saves nor undoes changes. Save important edits explicitly; the plugin does not automatically close user residents.

Command completion invalidates workspace preview caches. Return to preview or refresh to read current resident content, including edits not yet written to disk. Disk writes also trigger refresh. Official resident idle-saving behavior remains upstream's responsibility.

### Selection attachments

1. In a Word or PowerPoint live-preview page, click a paragraph or object.
2. Choose **Reference selected objects** to attach its snapshot to the current workspace's conversation input. If no conversation is open, use the attachment picker and choose the prepared Office selection. This is not an `@` menu and does not send a message automatically.

Selections are official selectable objects, not arbitrary character ranges. Excel selection attachments are not supported. At most ten objects can be selected; each snapshot uses official `get --depth 4` and is limited to 256 KiB.

Snapshots contain paths and document content. Once prepared or sent, they do not track later file/selection changes. Before editing, an AI should reread the referenced paths and verify current content, asking if paths or content have changed. The official save workflow still applies.

Automatic attachment is scoped to the current workspace. A new reference replaces the pending choice; plugin reload invalidates it. The picker may still show the last snapshot, so check the file name after switching workspaces. The server retains at most twenty snapshots; attachments already added to conversations are their own copies. Paseo's local `file:` attachment label does not currently open the original document; use the file tree.

### Watch lifecycle and remote access

- A file shares one plugin-started watch with a separate lease per tab. Closing the final interactive page, disabling, or reloading the plugin stops only its own foreground watch. Disconnected leases expire after roughly 45–55 seconds; background-frozen tabs may need reopening. At most eight files can be open interactively.
- The OS assigns the loopback port. The plugin does not take over a user-started watch or call `unwatch` to resolve conflicts. Official refusal to start is shown as an error.
- The browser never connects directly to the daemon machine's `localhost`. Official fetch/SSE traffic crosses an iframe message bridge and authenticated Paseo RPC. No watch port needs to be exposed. This architecture supports a separate browser/daemon, but it is **not a claim of real relay or remote-device acceptance testing**.
- The bridge permits only the current file's HTML, object selection, Excel cell-text changes, and chart x/y changes. File switching, arbitrary URLs, batch calls, and unrelated commands are rejected. Requests recheck real workspace paths and official service file identity. Writes are serialized.
- Each request is limited to 64 KiB; responses and event buffers to 16 MiB each. Event buffers hold at most 256 entries; a gap requires reloading the official page. Startup is limited to 15 seconds and ordinary requests to 60 seconds. Timed-out writes can have an unknown outcome.
- Official HTML uses an independent-origin `sandbox="allow-scripts"` iframe, without `allow-same-origin`, popups, or top navigation. CSP blocks external resources and script network requests, but document links can still navigate within the frame. Do not open untrusted links; this is not a network firewall.

## Interface-language persistence

The language preference is plugin-local Web Storage for the current desktop/browser client, shared by panels of that client and restored on refresh. It does not change daemon settings or Paseo's global language. If storage is unavailable, a translated error is shown and the current choice remains in memory only. Native mobile persistence is not promised.

Host-rendered titles follow Paseo even when the plugin has a manual override. Choosing Traditional Chinese in the plugin does not add a language to Paseo. Only plugin-owned labels and error wrappers are translated, never arbitrary official stderr, document content, commands, or official pages. See the [internationalization contract](I18N.md) for contributor rules.
