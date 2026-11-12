# Paseo OfficeCLI

由官方 [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 驱动，在 [Paseo](https://github.com/getpaseo/paseo) 内预览和处理 Word、Excel、PowerPoint 文件。

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[![Checks](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml/badge.svg)](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml)
[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[功能](#features) · [安装](#installation) · [使用](#usage) · [安全](#safety) · [开发](#development)

<a id="features"></a>
## 功能

- **在文件面板预览。** 使用 OfficeCLI 的 HTML 渲染器打开 `.docx`、`.xlsx`、`.pptx`，支持切换工作表和浏览多页幻灯片；磁盘文件变化后自动刷新预览。
- **交互编辑 Excel。** 通过官方 watch 页面编辑单元格文字、拖动图表，再使用 OfficeCLI 保存。
- **引用 Word 和 PowerPoint 选区。** 把选中对象的快照附加到当前工作区的对话，不会自动发送消息。
- **按需使用完整 CLI。** 高级命令接收 JSON 参数数组及标准输入，提供执行确认、stdout/stderr、实时状态和停止操作；不经过 shell，也不固定命令白名单。
- **独立选择界面语言。** 跟随 Paseo，或为插件选择 English、简体中文、繁體中文、日本語。

> Word 和 PowerPoint 的交互页面提供实时预览与对象选择，**不支持原位文本编辑**。其他编辑请使用高级命令、Paseo agent 或终端。

<a id="requirements"></a>
## 环境要求

| 组件 | 要求 |
| --- | --- |
| Paseo | **0.16.0-beta.1 或更新版本**，已启用 trusted plugins |
| OfficeCLI | 官方稳定版 **1.0.160 或更新版本**，安装在 daemon 所在机器 |
| 客户端 | Paseo 桌面端或现代浏览器；不支持原生手机客户端的 Office 预览 |

OfficeCLI 独立安装、独立升级，本插件不捆绑、分叉或锁定其二进制。后续稳定版需要保持公开 CLI 与 watch 接口兼容；上游出现破坏性变更时，可能仍需更新插件。

<a id="installation"></a>
## 安装

1. **在运行 Paseo daemon 的机器上**按 [OfficeCLI 官方安装说明](https://github.com/iOfficeAI/OfficeCLI#installation)安装，然后确认：

   ```sh
   officecli --version
   ```

2. 审阅本插件源码和主机权限后安装：

   ```sh
   paseo plugin install https://github.com/plumegod/paseo-officecli.git
   ```

3. 默认自动查找 OfficeCLI。只有自定义安装位置才需在 **Paseo 设置 → 插件 → paseo-officecli → OfficeCLI** 填写可执行文件绝对路径并保存。插件不增加侧边栏工作台。
4. 在工作区文件树打开 Office 文件，选择 **OfficeCLI**；如需记住选择，可勾选 **不再询问**。也可在 **设置 → 文件** 中指定默认打开方式，无需卸载其他 Office 插件。

更新插件：

```sh
paseo plugin update paseo-officecli
```

此命令只更新插件。OfficeCLI 请按官方说明独立升级，在插件设置中重新检测路径和版本，并重新打开交互页面。详见[程序查找与升级说明](docs/USAGE.md#officecli)（英文）。

<a id="usage"></a>
## 使用

### 预览与交互页面

打开文件时默认显示**只读预览**。Excel 可选择 **交互编辑**；Word 和 PowerPoint 可选择 **实时预览/选择**。交互页面使用 OfficeCLI 自己的 watch 服务，能够修改当前原文件。

点击 **保存** 执行官方保存命令；离开页面不等于保存或撤销。Word 和 PowerPoint 可在选中对象后点击 **引用选中区域**，准备对话附件。快照包含文件路径和对象内容，向 AI 发送敏感信息前请先检查。

### 高级命令

在已打开的文件内选择 **高级命令**，输入 JSON 字符串数组，**不包含** `officecli` 前缀，例如：

```json
["set", "draft.docx", "/body/p[1]", "--prop", "text=Updated from Paseo"]
```

每一项就是一个参数。相对路径以当前工作区为基准；Windows 路径中的反斜杠须转义为 `\\`。运行前请在确认弹窗中核对实际程序、工作目录、参数及权限。

批处理或交互协议可展开标准输入区域。`|`、`&&`、`>` 等 shell 运算符不会被解释。请查阅当前官方帮助，不要猜测命令：

```json
["help"]
```

[使用指南](docs/USAGE.md)（英文）包含批处理输入、输出上限、任务停止、选区快照及 watch 生命周期说明。[样例文件](examples/)同时用于集成测试。

<a id="language"></a>
## 界面语言

打开 **Paseo 设置 → 插件 → paseo-officecli → OfficeCLI → 语言**。默认**跟随 Paseo**，也可手动选择 English、简体中文、繁體中文或日本語。

语言偏好仅保存在当前桌面／浏览器客户端，不修改 Paseo 全局语言或 daemon 设置。切换语言不会丢失草稿、任务、输出、选区或交互会话。OfficeCLI 命令、原始输出、文档内容和官方页面不翻译；宿主渲染的入口标题仍跟随 Paseo 的语言。

<a id="safety"></a>
## 安全与限制

- **可信主机执行，不是文件系统沙箱。** 高级命令以 daemon 账户运行，可访问工作区外文件、网络或全局配置。请备份重要文件；执行失败、停止或超限终止都**不会撤销**已生效的修改。
- **预览与编辑权限不同。** 只读预览不修改原文件；交互模式会启动本机 watch 服务，并允许对原文件进行受支持的编辑。预览和交互路径均校验真实工作区边界。
- **不可信文档仍然不可信。** 官方 HTML 在仅允许 `allow-scripts` 的隔离 iframe 中运行，外部资源被阻止。这不是完整的文档安全沙箱或网络防火墙，请勿点击不可信的文档链接。
- **请明确保存。** 插件不改变 OfficeCLI resident 的自动保存策略，不在退出时自动保存，也不关闭用户自建的 resident/watch 服务。写入超时后可能已经生效，请先检查再决定是否重试。
- **渲染不是 Microsoft Office。** 不支持旧格式 `.doc` / `.xls` / `.ppt`、加密文件或原生手机端预览。远程字体、公式库及 3D 资源被阻止，复杂排版可能存在差异。

精确上限和远程访问行为见[使用指南](docs/USAGE.md)（英文）。请在 [Issues](https://github.com/plumegod/paseo-officecli/issues) 提交可复现问题，附上 Paseo/OfficeCLI 版本及脱敏日志。反馈预览布局问题前，请先查看[已知问题](https://github.com/plumegod/paseo-officecli/issues/1)。

<a id="development"></a>
## 开发

使用 **Node.js 22.18 或更新版本**。Paseo 提供运行时 SDK 和客户端模块，插件没有额外运行时依赖。

```sh
npm ci
npm run typecheck
npm test
npm run test:regression
npm run test:integration
```

最后两条命令需要已安装的官方 OfficeCLI，找不到时会直接失败。集成测试使用临时文档；watch 测试还覆盖 resident／保存行为，约需两分钟。GitHub Actions 在 push 和 pull request 时于 Windows 执行类型检查及单元／规范／文档测试；**目前不会**执行 OfficeCLI 集成测试或最新版本矩阵。

本地安装前，先移除已有的同 ID 插件安装源，然后运行：

```sh
paseo plugin install .
paseo plugin reload paseo-officecli
```

贡献前请阅读 [AGENTS.md](AGENTS.md) 和[运行时国际化规范](docs/I18N.md)（英文）。修改任意一份 README 的请求，都意味着在**同一次变更中更新全部三种语言**。`npm test` 校验共用章节锚点、链接、版本号及命令示例；CI 会拒绝遗漏语言的 README 变更。译文含义仍需人工审阅。

<a id="license"></a>
## 许可证

[MIT](LICENSE)。本项目独立维护，并非 Paseo 或 iOfficeAI 官方产品。OfficeCLI 自身许可见其[上游仓库](https://github.com/iOfficeAI/OfficeCLI)，本仓库不分发其二进制。
