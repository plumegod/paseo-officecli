# Paseo OfficeCLI

在 Paseo 文件面板预览 Word、Excel、PowerPoint；需要手动操作时，可在文件内打开**高级命令**，调用 [官方 OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 的完整命令行。默认只显示文档预览，不需要配置命令或标准输入；Excel 还可通过**官方 watch 页面**直接编辑单元格、拖动图表。

OfficeCLI 独立安装、独立升级。本插件不分发二进制、不维护 Office 转换器，也不把命令能力冻结成一组按钮。

## 安装

1. 按 [OfficeCLI 官方说明](https://github.com/iOfficeAI/OfficeCLI#installation)在运行 Paseo daemon 的机器上安装 OfficeCLI，确认 `officecli --version` 能运行。
2. Paseo ≥ 0.15.3，已启用 trusted plugins。插件有主机执行权限，请先审阅源码，再安装：

   ```sh
   paseo plugin install https://github.com/plumegod/paseo-officecli.git
   ```

3. 默认自动查找 OfficeCLI，无需额外设置。只有使用自定义安装位置时，才需在 **Paseo 设置 → 插件 → paseo-officecli 的操作菜单 → OfficeCLI** 填写可执行文件绝对路径并保存。此页不执行文档命令，插件不在常用侧边栏增加入口。
4. 在工作区文件树点击 `.docx`、`.xlsx` 或 `.pptx`，选择 **OfficeCLI**，勾选 **不再询问** 并点击 **使用**；也可在 **设置 → 文件** 选择默认打开方式。已有其他 Office 插件时无需卸载它们。

本地开发安装（如果同 ID 的插件已经安装，先移除该安装源，勿重复安装）：

```sh
npm ci
npm run typecheck
npm test
paseo plugin install .
# 修改代码后：
paseo plugin reload paseo-officecli
```

## 文件内高级命令

### 打开与执行

在已打开的 Office 文件顶部点击 **高级命令**，自动带入当前文件路径；**返回预览**可回到文档。没有独立工作台、新建标签页或命令中心入口。没有现成 Office 文件时，可在 Paseo 终端运行官方 `create` 后再打开文件。

高级命令不是设置。标准输入默认收起，运行前弹窗展示实际程序、工作目录、参数及权限风险，点击 **确认运行** 后才执行。运行时才显示停止，有任务后才显示状态和输出；无需手动刷新状态。

输入 **JSON 字符串数组**，不填写 `officecli` 前缀，例如：

```json
["set", "draft.docx", "/body/p[1]", "--prop", "text=Updated from Paseo"]
```

每个数组项就是一个参数，空格不需要额外 shell 引号；Windows 路径中的反斜杠须按 JSON 写成 `\\`。相对路径以当前 Paseo 工作区为基准。点击 **运行命令**，核对弹窗后点击 **确认运行**。

**不经过 shell**，因此 `|`、`&&`、`>`、`$(...)` 不会变成管道、重定向或命令替换。需要 `batch` 时展开 **输入内容（批处理或交互命令）**，而不是填写 shell 管道。

### 能力与示例

下列只是示例，不是命令白名单。任意当前官方子命令和参数均原样传递，官方行为和错误也不被插件改写。

| 需求 | argv 示例 |
| --- | --- |
| 当前版本帮助 | `["help"]` 或 `["help", "set"]` |
| 当前完整结构化能力 | `["help", "all", "--json"]`，全局命令另见 `help` / 对应子命令帮助 |
| 创建空白文档 | `["create", "draft.docx"]`；也支持 `.xlsx` / `.pptx` |
| 添加内容 | `["add", "draft.docx", "/body", "--type", "paragraph", "--prop", "text=Hello"]` |
| 读取文本 | `["view", "draft.docx", "text"]` |
| 读取结构、样式 | `["get", "draft.docx", "/body/p[1]", "--json"]` |
| 查询公式 | `["query", "book.xlsx", "cell:has(formula)", "--json"]` |
| 分析问题 | `["view", "draft.docx", "issues", "--json"]`；或 `["validate", "draft.docx"]` |
| 修改文本或格式 | `["set", "draft.docx", "/body/p[1]/r[1]", "--prop", "font=Calibri", "--prop", "color=1E2761"]` |
| 修改公式 | `["set", "book.xlsx", "/Sheet1/C1", "--prop", "formula=SUM(A1:B1)"]` |
| 克隆元素 | `["add", "draft.docx", "/body", "--from", "/body/p[1]"]` |
| 移动元素 | `["move", "draft.docx", "/body/p[2]", "--index", "0"]` |
| 删除元素 | `["remove", "draft.docx", "/body/p[2]"]` |
| 保存到磁盘 | `["save", "draft.docx"]` |

图表、图片、布局、跨文档内容和底层 XML 等，同样使用官方 `add` / `set` / `dump` / `batch` / `import` / `merge` / `raw` / `raw-set` / `add-part` 等能力。`open`、`close`、`watch`、`unwatch`、`mcp`、`plugins`、`skills`、`install` 等命令也不被拦截；**它们可能启动服务、访问网络或更改全局配置**。以当前官方帮助为准，不猜测属性或发明不存在的 `copy` 命令。

### 标准输入、批处理与跨文档重组

执行 `["batch", "book.xlsx"]`，标准输入可填官方 JSON：

```json
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"12"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"30"}},
  {"command":"set","path":"/Sheet1/C1","props":{"formula":"SUM(A1:B1)"}}
]
```

默认发送输入后关闭 stdin。官方 `batch` 默认原子执行，失败时由官方回滚；只有显式指定官方 `--best-effort` 等选项才改变其语义。插件不追加 `--force`、保存、重试或任何命令参数。

跨文档复制可以先执行 `["dump", "source.docx", "/body"]`，选择 **输出 → 复制完整输出**，再创建目标文档并执行 `["batch", "target.docx"]`，将刚才的 JSON 放入标准输入。只 dump 子树不包含它依赖的全部样式、资源或工作簿设置；需要完整重建时用官方根级 dump 和对应格式说明，不承诺子树复制能自动搬运所有外部依赖。

### 输出、长任务与停止

- 有任务后才显示状态、退出码与进程信号；**输出 / 错误输出**分别查看 stdout / stderr，**复制完整输出**复制当前所选流。非零退出不会伪装成成功。
- 每工作区最多一条运行中的命令，保留最近一条；最多保留 8 个工作区任务，优先淘汰已完成任务。
- 运行时每秒查询状态。任务独立于面板存在，切换预览不会终止它；不是持久作业系统，daemon 重启不恢复历史任务。
- 高级命令**没有预览用的 60 秒超时**。展开输入并启用 **保持输入打开** 后，可继续 **发送输入** 或 **结束输入（EOF）**，适用于官方 MCP stdio 等协议。协议换行需自行填写。
- **停止命令**、重载或禁用插件，会终止本插件启动的前台进程。停止不是撤销，也不负责关闭官方自己分离启动的 resident / watch 服务；按官方 `close` / `unwatch` 管理。
- argv 和单次 stdin 各最多 1 Mi 字符；argv 最多 1024 项，禁止 NUL。待消费 stdin 队列最多 4 MiB。
- stdout + stderr 共最多 16 MiB，超限停止并明确告警，已生效的修改不会回滚。界面展示各流前 200000 字符，**复制完整输出**可取到该上限内保存的全部内容。
- stdio 按 UTF-8 文本处理，使用管道而非 TTY；需要真正交互终端的第三方命令请使用 Paseo 终端。导出 PDF、PNG 等二进制内容请使用官方文件输出参数，不要把二进制 stdout 当成文本复制。

## 官方交互页面

打开文件后，默认仍是只读预览。Excel 点击 **交互编辑**；Word / PowerPoint 点击 **实时预览/选择**。插件启动本机官方 `watch <file> --port 0`，嵌入它生成的 HTML 和交互脚本，**没有另写一套表格或伪造 contenteditable 编辑器**。

| 格式 | OfficeCLI 1.0.160 实测能力 |
| --- | --- |
| `.xlsx` | 双击单元格输入文字，Enter / 失焦提交，Escape 取消；鼠标拖动图表改变锚点，修改作用于当前原文件 |
| `.docx` / `.pptx` | 实时预览、元素选择；**不支持原位文本编辑**，请切换高级命令使用官方编辑能力 |

### 提交与保存

- 工具栏 **保存** / **重载**；提交中、保存中、已保存显示在按钮上，不另写说明段。HTTP 成功不代表编辑成功：还会检查官方 CLI 的内层 JSON 结果；失败时才显示错误，不会显示为已保存，不会自动重试写入。
- **保存**只执行官方 `save <当前文件> --json`；成功后按钮显示已保存，不代表之后的外部修改也已保存。打开页面本身不宣称现有 resident 已落盘。
- 官方 resident / `OFFICECLI_RESIDENT_FLUSH` 自动保存策略保持不变；插件不强制自动保存，也不自动 `close` 用户的 resident。退出交互页不是保存或撤销，重要修改请明确保存。
- 连接失败时显示错误，可切回只读预览或高级命令。处理原因后可点击 **重载**；不静默降级成假编辑器。

### 服务生命周期与远程访问

- 同一原文件共享一个插件自建 watch，每个标签页有独立租约；关闭最后一个交互页、禁用/重载插件时，只停止插件自己启动的前台 watch。断线租约约 45–55 秒后清理（后台冻结的标签页也可能过期，重新打开即可）。最多同时打开 8 个文件。
- 端口由操作系统分配，不占用固定端口。若该文件已有用户启动的 watch，官方拒绝启动时明确报错，**不接管、不调用 unwatch、不关闭用户服务**。
- 浏览器不直连 daemon 的 `localhost`。官方页面的 fetch / SSE 经 iframe 消息桥及 Paseo 的已认证 RPC 转发，支持浏览器与 daemon 不在同一机器；无需开放 watch 端口或降低隔离。
- 只允许当前文件的 HTML、元素选择、Excel 单元格文字和图表 x/y 更新；拒绝切换文件、任意 URL、批处理及其他命令。每次操作重新校验工作区真实路径和官方服务的文件身份。写入串行处理，请勿把不可信 Office 内容当成安全内容。
- 单次请求最多 64 KiB，响应及事件缓冲各最多 16 MiB；事件缓冲最多 256 条，断档时重新获取官方页面。启动限 15 秒，普通请求限 60 秒，超时的写入结果可能未确认，先检查再决定是否重试。

## 文件预览

- `.docx` / `.xlsx` / `.pptx` 在 Paseo 面板内使用官方 HTML，保留工作表切换与多页幻灯片浏览。
- **只读预览**本身不修改文件；交互能力见上节，更多编辑可用同一面板的高级命令、Paseo agent 或终端。
- 命令完成会使工作区预览缓存失效，返回预览或点击 **刷新预览**可重新读取官方 resident 中尚未落盘的内容。
- 文件写入磁盘后自动刷新。需要提交到磁盘时自行执行官方 `save` / `close`；官方 resident 自身的空闲自动保存行为保持不变，插件不追加保存或自动关闭用户常驻进程。
- `examples/` 提供三个由官方 OfficeCLI 生成的试用文件。

## OfficeCLI 独立升级

**OfficeCLI 不是本插件的依赖包，也不随插件发布。** 每次启动命令、预览或新的 watch 服务都重新查找官方程序；不缓存版本、不检查硬编码版本范围、不复制官方实现。正在运行的进程不会热切换二进制，替换前请按官方说明处理正在使用它的任务；已有交互页请全部退出后重开。

查找顺序：

1. 插件设置中的绝对路径（不加引号）。
2. daemon 环境变量 `OFFICECLI_PATH`。
3. daemon 的 `PATH`。
4. 官方默认位置：Windows `%LOCALAPPDATA%\OfficeCLI\officecli.exe`；macOS / Linux `~/.local/bin/officecli`。

按官方 README **重新运行官方安装器**即可升级到最新版本；下次预览或执行会重新查找程序，也可点击文件面板 **刷新预览**。无需更新插件。不要运行 `officecli update`，官方目前没有此命令。

如果 daemon 启动较早，尚未获得更新后的 PATH，默认安装位置仍可识别；自定义安装位置可直接填写设置。错误配置明确报错，不静默回退到另一版本。

高级命令只透传 argv / stdio，不解析或固定官方命令树；升级后直接使用当前官方 `help`。HTML 预览依赖公开的 `view <file> html` 接口；交互页依赖官方 watch HTML、SSE 和 JSON 协议，当前实测 1.0.160。不认识的页面协议会明确报错并保留预览/命令入口。不能保证未知未来版本永不破坏接口，但常规二进制升级及新增子命令不需要插件同步发版。

## 安全与边界

**命令执行、交互编辑和只读预览的权限不同：**

- **高级命令是可信主机操作，不是文件系统沙箱。** cwd 取自真实 Paseo 工作区，但官方命令可以使用绝对路径访问工作区外文件、执行官方插件功能、访问网络或更改全局配置。执行前必须确认，请备份重要文件。
- 服务器校验 RPC 输入、工作区身份和任务 ID；通过参数数组直接启动程序，不使用 shell。确认并不让不可信 Office 文件或命令变得安全。
- **单独打开只读预览**只调用本机官方渲染器，不上传、不修改原文件、不创建额外 HTML 文件、不启动预览 HTTP 服务。预览和交互文件路径均校验真实工作区边界，拒绝向外的符号链接。**进入交互模式会启动 loopback watch，且允许官方页面修改当前原文件**；嵌入不等于 Office 文档安全沙箱。
- 官方 HTML 使用 `sandbox="allow-scripts"` 的独立来源 iframe；不允许 `allow-same-origin`、弹窗或顶层导航。CSP 阻止外部资源和脚本网络请求，但文档外链仍可在隔离框架内导航，**不要打开不可信链接**；CSP 不是网络防火墙。
- 网络字体、远程公式库及 3D 资源被禁用，相关内容可能简化或不能显示。复杂排版精确度由官方渲染器决定，非 Microsoft Office 的像素级替代品。
- HTML 预览仅支持现代三种格式，不支持旧版 `.doc` / `.xls` / `.ppt`、加密文档或原生手机客户端预览。每次预览最多 60 秒、16 MiB 输出。命令支持范围由官方程序决定，不受预览扩展名列表限制。
- 不后台自动下载或执行安装器。仅在用户明确运行对应官方命令时执行其全局操作。
- 本项目独立开源，不是 Paseo 或 iOfficeAI 官方产品。PPTX 首次打开遮挡问题单独跟踪于 [#1](https://github.com/plumegod/paseo-officecli/issues/1)，不在本功能中宣称已修复。

## 验证

开发检查需要 Node.js ≥ 22.18（内置 TypeScript 类型擦除）。插件运行时由 Paseo 提供 SDK 和客户端模块，零额外运行时依赖。

```sh
npm ci
npm run typecheck
npm test
# 需要已安装的官方 OfficeCLI；文件预览、命令及真实 MCP 长运行回归：
npm run test:regression
# 另包含 watch/resident 测试，约 2 分钟：
npm run test:integration
```

测试不跳过缺失依赖：找不到 OfficeCLI 时直接失败。集成测试创建临时文档，不打开或关闭用户的 resident。

GitHub Actions 在 PR、`main` push、手动触发及每日定时运行 Windows x64 回归：只测试 1.0.160 和官方最新稳定版，相同时去重。工作流下载官方发行资产并校验 `SHA256SUMS` 和实际版本，使用临时目录与独立 `OFFICECLI_PATH`，不安装或替换用户程序。每个版本的校验信息、测试输出和失败日志保存在对应的 Actions artifact 中；获取或验证失败会使检查失败。

- 单元测试覆盖路径边界、argv 不经 shell、未知未来命令、stdin / EOF、退出错误、停止与任务身份、输出和保留数量上限，以及 watch 路由白名单、嵌套业务失败、iframe 消息身份、SSE 转发、同文件多租约、快速重开、进程退出、事件断档与跨文件拒绝。
- 官方 CLI 集成测试覆盖三种预览且原文件不变，以及创建、文本 / JSON / 样式 / 公式读取、问题分析、字体颜色和布局修改、图表图片、克隆 / 移动 / 删除、dump → batch 跨文档重放、原子批处理失败不写入、MCP 双向 stdio 持续超过 60 秒后停止。
- 界面回归检查覆盖仅注册文件预览与原生设置、默认自动查找、按需保存路径、执行确认、任务状态与条件显示操作。
- 已在 Paseo 0.15.3 / OfficeCLI 1.0.160 实测原生设置入口、默认只读预览、文件内高级命令、确认取消与执行、MCP 双向输入 / EOF / 停止，以及 400px 窄屏。验收后已恢复原插件安装源和非调试桌面启动。

### #4 实机验收记录

Windows、OfficeCLI **1.0.160**、Paseo **0.15.3 内置 Web UI**，使用单独的 loopback 测试 daemon / home 和临时文档，不替换用户已安装插件、不启用 relay：

- 在真正的 Paseo 文件面板进入 Excel 交互页，双击 A1，输入 `Paseo file panel 中文` 后 Enter；界面及官方 `get` 均读到新文本。
- 用鼠标拖动官方图表，锚点由 `D4:J18` 变为 `G8:M22`，尺寸不变；不是用命令模拟拖动。
- 点击保存按钮（当时标为 **保存到磁盘**，当前为 **保存**）获得确认，关闭文件页后 watch 退出，重新打开仍保留文本；把原文件复制到全新路径、禁用自动 resident 后独立读盘，文字及 `G8:M22` 均保留。
- Word / PPTX 显示真实的“实时预览/选择”限制及命令入口；Word 双击文本没有伪造输入框。命令入口原有 argv / stdin 能力正常。
- 强制结束**测试文件的自建 watch**后，Paseo 显示连接失败、未确认状态及预览/命令回退入口。iframe 实测仍只有 `allow-scripts`，没有 `allow-same-origin`。
- 自动化 `tests/watch.integration.mjs` 另用测试自建 resident、`OFFICECLI_RESIDENT_FLUSH=off` 验证：提交已生效但磁盘字节未变，明确 save 后才落盘；多标签租约互不误关，插件退出不关闭 resident。界面验收不冒充这项延迟落盘验证。

未实测异地设备/真实 relay、原生手机客户端、其他 OfficeCLI 版本的交互页，也不宣称 Word/PPTX 已有完整所见即所得编辑。

功能跟踪：[完整命令能力 #2](https://github.com/plumegod/paseo-officecli/issues/2)、[原生界面与设置定位 #3](https://github.com/plumegod/paseo-officecli/issues/3)、[官方交互页面 #4](https://github.com/plumegod/paseo-officecli/issues/4)。设置只接入 Paseo 设置页，高级命令只在文件预览内按需打开。

## 更新插件

```sh
paseo plugin update paseo-officecli
```

该命令只更新插件；OfficeCLI 仍按上文独立更新。

## License

MIT. OfficeCLI 本身的许可见其官方仓库，本插件不分发 OfficeCLI 二进制。
