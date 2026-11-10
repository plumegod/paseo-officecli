# Paseo OfficeCLI

在 Paseo **桌面端 / 浏览器**内打开 Word、Excel、PowerPoint 文件，使用 [官方 OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 的 HTML 渲染器，而不是另外维护一套 Office 转换器。

## 安装

1. 按 [OfficeCLI 官方说明](https://github.com/iOfficeAI/OfficeCLI#installation)在运行 Paseo daemon 的机器上安装 OfficeCLI，确认 `officecli --version` 能运行。
2. Paseo ≥ 0.15.3，已启用 trusted plugins。插件有主机执行权限，请先审阅源码，再安装：

   ```sh
   paseo plugin install https://github.com/plumegod/paseo-officecli.git
   ```

3. 打开侧边栏 **OfficeCLI** 或 **设置 → OfficeCLI**，检查可执行文件路径和版本。
4. 在工作区文件树点击 `.docx`、`.xlsx` 或 `.pptx`，选择 **OfficeCLI**，勾选 **不再询问** 并点击 **使用**；也可在 **设置 → 文件** 为各扩展名选择默认打开方式。已有其他 Office 插件时无需卸载它们。

本地开发安装：

```sh
npm ci
npm run typecheck
npm test
paseo plugin install .
# 修改代码后：
paseo plugin reload paseo-officecli
```

## 使用

- 文件在 Paseo 的面板内打开，保留官方 HTML 的工作表切换与多页幻灯片浏览。
- 文件写入磁盘后自动刷新；点击 **刷新** 重新调用当前 OfficeCLI，也可看到其常驻进程尚未落盘的内容。
- 面板是**只读预览**，不是 Word/Excel 式可视化编辑器。使用 Paseo agent 或终端直接运行官方命令编辑，例如：

  ```sh
  officecli set examples/smoke.xlsx /Sheet1/A2 --prop value="Updated in Paseo"
  officecli save examples/smoke.xlsx
  ```

- `examples/` 提供三个由官方 OfficeCLI 生成的试用文件。

## OfficeCLI 独立升级

**OfficeCLI 不是本插件的依赖包，也不随插件发布。** 每次请求重新查找并启动官方程序；不缓存其版本、不检查硬编码版本范围、不复制官方渲染实现。

查找顺序：

1. 插件设置中的绝对路径（不加引号）。
2. daemon 环境变量 `OFFICECLI_PATH`。
3. daemon 的 `PATH`。
4. 官方默认位置：Windows `%LOCALAPPDATA%\OfficeCLI\officecli.exe`；macOS / Linux `~/.local/bin/officecli`。

按官方 README **重新运行官方安装器**即可升级到最新版本；然后点击插件 **重新检查** 和文件面板 **刷新**。无需更新插件。不要运行 `officecli update`，官方目前没有此命令。

如果 daemon 启动较早，尚未获得更新后的 PATH，默认安装位置仍可识别；自定义安装位置可直接填写设置，不必重启 daemon。切换路径保存后，下一次请求使用新路径。插件报错会明确显示，错误配置不会静默回退到另一版本。

插件只依赖官方公开的 `--version`、`view <file> html` 接口。上游若将来破坏这些命令的兼容性，仍需适配插件；不能保证未知未来版本永不破坏接口。常规官方二进制升级不需要插件升级。

## 安全和限制

- 文档只在 daemon 主机处理，不上传、不修改原文件、不创建额外 HTML 文件、不启动预览 HTTP 服务。
- 服务器校验工作区边界、真实路径（拒绝指向工作区外的符号链接）、文件类型；通过参数数组调用程序，**不使用 shell**。
- 官方 HTML 使用 `sandbox="allow-scripts"` 的独立来源 iframe；不允许 `allow-same-origin`、弹窗或顶层导航；CSP 阻止外部脚本、图片、字体和网络请求。脚本仅供官方预览交互，不能读取 Paseo 主页面或凭据。文档内的外链仍可在隔离框架内导航，**不要打开不可信链接**；CSP 不是网络防火墙。
- 网络字体、远程公式库及 3D 资源被禁用，相关内容可能简化或不能显示。复杂排版的精确度由官方渲染器决定，非 Microsoft Office 的像素级替代品。
- 仅支持 `.docx` / `.xlsx` / `.pptx`；不支持旧版 `.doc` / `.xls` / `.ppt`、加密文档或原生手机客户端预览。
- 每次渲染最多 60 秒、16 MiB 输出；超限明确报错。不后台自动下载或执行安装器，不干扰用户的 OfficeCLI 常驻进程。
- **OfficeCLI** 和插件独立开源，本项目不是 Paseo 或 iOfficeAI 官方产品。

## 验证

开发检查需要 Node.js ≥ 22.18（内置 TypeScript 类型擦除）。插件运行时由 Paseo 提供 SDK 和客户端模块，零额外运行时依赖。

```sh
npm ci
npm run typecheck
npm test
# 已安装官方 OfficeCLI 后，实际渲染三种文件并校验原文件未改变：
npm run test:integration
```

升级 OfficeCLI 后可再次运行集成测试。测试不跳过缺失依赖：找不到 OfficeCLI 时直接失败。

已在 Windows / Paseo 0.15.3 实测：三种文件点击打开、默认关联、多工作表切换、保存后自动刷新，以及同一路径从官方 OfficeCLI 1.0.159 替换到 1.0.160 后无需重装插件即可重新检测。两个版本均通过全部 4 项真实 CLI 集成测试。

## 更新插件

```sh
paseo plugin update paseo-officecli
```

该命令只更新插件；OfficeCLI 仍按上文独立更新。

## License

MIT. OfficeCLI 本身的许可见其官方仓库，本插件不分发 OfficeCLI 二进制。
