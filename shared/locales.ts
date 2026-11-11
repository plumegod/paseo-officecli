import { errorCatalog } from "./error-messages.ts";

// English is the source language. Every row is [en, zh-CN, zh-TW, ja].
export const catalog = {
  ...errorCatalog,
  brand: ["OfficeCLI", "OfficeCLI", "OfficeCLI", "OfficeCLI"],
  frameTitle: ["OfficeCLI preview: {{name}}", "OfficeCLI 预览：{{name}}", "OfficeCLI 預覽：{{name}}", "OfficeCLI プレビュー：{{name}}"],
  language: ["Language", "语言 / Language", "語言 / Language", "言語 / Language"],
  follow: ["Follow Paseo", "跟随 Paseo", "跟隨 Paseo", "Paseo に合わせる"],
  languageScope: ["Applies only to this client's plugin UI. Host menus follow Paseo; official output is unchanged.", "仅影响当前客户端的插件界面；宿主菜单跟随 Paseo，官方输出不变。", "僅影響目前用戶端的外掛介面；主程式選單跟隨 Paseo，官方輸出不變。", "このクライアントのプラグイン UI のみに適用。ホストのメニューは Paseo に従い、公式出力は変更しません。"],
  storageUnavailable: ["Language preference could not be saved on this client.", "无法在当前客户端保存语言偏好。", "無法在目前用戶端儲存語言偏好。", "このクライアントでは言語設定を保存できません。"],
  program: ["Program", "程序", "程式", "プログラム"],
  executablePath: ["Executable path", "可执行文件路径", "執行檔路徑", "実行ファイルのパス"],
  autoFind: ["Find automatically", "自动查找", "自動尋找", "自動検出"],
  pathHint: ["Leave blank to find automatically; custom paths must be absolute.", "留空时自动查找；自定义路径须为绝对路径。", "留空時自動尋找；自訂路徑須為絕對路徑。", "空欄で自動検出。指定する場合は絶対パスを使用してください。"],
  currentPath: ["Leave blank to find automatically. Current: {{version}} · {{path}}", "留空时自动查找。当前：{{version}} · {{path}}", "留空時自動尋找。目前：{{version}} · {{path}}", "空欄で自動検出。現在：{{version}} · {{path}}"],
  unknownVersion: ["Unknown version", "版本未知", "版本未知", "バージョン不明"],
  reading: ["Reading…", "正在读取…", "正在讀取…", "読み込み中…"],
  saveChanges: ["Save changes", "保存更改", "儲存變更", "変更を保存"],
  save: ["Save", "保存", "儲存", "保存"],
  saving: ["Saving", "保存中", "儲存中", "保存中"],
  saved: ["Saved", "已保存", "已儲存", "保存済み"],
  submitting: ["Submitting", "提交中", "提交中", "送信中"],
  detectInstallation: ["Check path, version and capabilities", "检测路径、版本和能力", "檢測路徑、版本和功能", "パス・バージョン・機能を確認"],
  detecting: ["Checking", "检测中", "檢測中", "確認中"],
  recheck: ["Check again", "重新检测", "重新檢測", "再確認"],
  installationStatus: ["Installation status", "安装状态", "安裝狀態", "インストール状態"],
  htmlPreview: ["HTML preview", "HTML 预览", "HTML 預覽", "HTML プレビュー"],
  getShortcut: ["Document structure shortcut", "文档结构快捷入口", "文件結構捷徑", "文書構造ショートカット"],
  batchShortcut: ["Batch shortcut", "批处理快捷入口", "批次處理捷徑", "バッチショートカット"],
  saveCommand: ["Save command", "保存命令", "儲存命令", "保存コマンド"],
  mcpShortcut: ["MCP shortcut", "MCP 快捷入口", "MCP 捷徑", "MCP ショートカット"],
  supported: ["Supported according to help", "帮助声明支持", "說明宣告支援", "ヘルプで対応を確認"],
  missing: ["Explicitly missing", "明确缺失", "明確缺失", "非対応を確認"],
  unknown: ["Unknown", "未知", "未知", "不明"],
  supportVersion: ["Supported versions", "支持版本", "支援版本", "対応バージョン"],
  supportPolicy: ["Requires OfficeCLI 1.0.160 or later. Upgrade older versions to the official stable release. Later versions must retain public interface compatibility; otherwise the plugin may need updating.", "最低支持 OfficeCLI 1.0.160；较旧版本请升级至官方稳定版。后续版本需保持公开接口兼容，否则可能需要更新插件。", "最低支援 OfficeCLI 1.0.160；較舊版本請升級至官方穩定版。後續版本須保持公開介面相容，否則可能需要更新外掛。", "OfficeCLI 1.0.160 以降が必要です。古い場合は公式安定版に更新してください。今後のバージョンで公開 API の互換性が失われた場合、プラグインの更新が必要です。"],
  officialInstallLabel: ["Official OfficeCLI installation and upgrade instructions", "OfficeCLI 官方安装与升级说明", "OfficeCLI 官方安裝與升級說明", "OfficeCLI 公式インストール・更新手順"],
  officialInstall: ["Official installation and upgrade", "官方安装与升级", "官方安裝與升級", "公式インストール・更新"],
  advanced: ["Advanced commands", "高级命令", "進階命令", "詳細コマンド"],
  commandIntro: ["Run OfficeCLI commands. Enter a JSON array of strings, one argument per item; omit officecli.", "运行 OfficeCLI 命令。参数使用 JSON 字符串数组，每一项为一个参数；无需填写 officecli。", "執行 OfficeCLI 命令。參數使用 JSON 字串陣列，每項為一個參數；無需填寫 officecli。", "OfficeCLI コマンドを実行します。引数は JSON 文字列配列で、各要素に一つずつ指定します。officecli は不要です。"],
  viewStructure: ["View document structure", "查看文档结构", "檢視文件結構", "文書構造を表示"],
  viewHelp: ["View help", "查看帮助", "檢視說明", "ヘルプを表示"],
  batch: ["Batch", "批处理", "批次處理", "バッチ"],
  mcp: ["MCP", "MCP", "MCP", "MCP"],
  commandArgs: ["Command arguments", "命令参数", "命令參數", "コマンド引数"],
  commandArgsLabel: ["OfficeCLI command arguments", "OfficeCLI 命令参数", "OfficeCLI 命令參數", "OfficeCLI コマンド引数"],
  argsExample: ['For example ["help"]. “View document structure” fills in the current file path.', '例如 ["help"]；当前文件路径已填入“查看文档结构”。', '例如 ["help"]；目前檔案路徑已填入「檢視文件結構」。', '例：["help"]。「文書構造を表示」には現在のファイルパスが入力されます。'],
  inputTitle: ["Input (batch or interactive commands)", "输入内容（批处理或交互命令）", "輸入內容（批次或互動命令）", "入力（バッチ・対話型コマンド）"],
  filled: ["Filled in", "已填写", "已填寫", "入力済み"],
  inputHint: ["Sent through standard input; usually unnecessary for regular commands.", "此内容通过标准输入发送；普通命令通常无需填写。", "此內容透過標準輸入傳送；一般命令通常無需填寫。", "標準入力として送信します。通常のコマンドでは不要です。"],
  inputLabel: ["OfficeCLI input", "OfficeCLI 输入内容", "OfficeCLI 輸入內容", "OfficeCLI 入力内容"],
  keepInput: ["Keep input open", "保持输入打开", "保持輸入開啟", "入力を開いたままにする"],
  keepInputHint: ["For long-running tasks that need more input.", "用于需要继续发送输入的长任务。", "用於需要繼續傳送輸入的長時間工作。", "追加の入力が必要な長時間タスク用です。"],
  sending: ["Sending", "发送中", "傳送中", "送信中"],
  sendInput: ["Send input", "发送输入", "傳送輸入", "入力を送信"],
  endInput: ["End input (EOF)", "结束输入（EOF）", "結束輸入（EOF）", "入力を終了（EOF）"],
  stopping: ["Stopping", "停止中", "停止中", "停止中"],
  stopCommand: ["Stop command", "停止命令", "停止命令", "コマンドを停止"],
  starting: ["Starting", "启动中", "啟動中", "起動中"],
  runCommand: ["Run command", "运行命令", "執行命令", "コマンドを実行"],
  preparing: ["Preparing OfficeCLI…", "正在准备 OfficeCLI…", "正在準備 OfficeCLI…", "OfficeCLI を準備中…"],
  retry: ["Retry", "重试", "重試", "再試行"],
  running: ["Running", "运行中", "執行中", "実行中"],
  completed: ["Completed", "已完成", "已完成", "完了"],
  failed: ["Failed", "执行失败", "執行失敗", "失敗"],
  stopped: ["Stopped", "已停止", "已停止", "停止済み"],
  exitCode: [" · Exit code {{code}}", " · 退出码 {{code}}", " · 結束代碼 {{code}}", " · 終了コード {{code}}"],
  stdout: ["Output", "输出", "輸出", "出力"],
  stderr: ["Error output", "错误输出", "錯誤輸出", "エラー出力"],
  copyOutput: ["Copy full output", "复制完整输出", "複製完整輸出", "出力をすべてコピー"],
  outputLabel: ["{{stream}} command output", "{{stream}} 命令输出", "{{stream}} 命令輸出", "{{stream}} コマンド出力"],
  empty: ["(empty)", "（空）", "（空）", "（空）"],
  truncated: ["\n…Only the first 200000 characters are displayed. Copy the full output to see more.", "\n…界面仅展示前 200000 字符，可复制完整输出。", "\n…介面僅顯示前 200000 字元，可複製完整輸出。", "\n…先頭 200000 文字のみ表示しています。出力をすべてコピーできます。"],
  confirmTitle: ["Confirm command execution", "确认运行命令", "確認執行命令", "コマンド実行の確認"],
  commandRisk: ["Commands run as the host account and may modify files outside the workspace, access the network or change global configuration. Back up important files. Failure (including a nonzero exit), stopping or limit termination does not undo changes; check the files.", "命令以宿主账户执行，可修改工作区外文件、访问网络或更改全局配置。请备份重要文件；执行失败（包括非零退出）、停止或超限终止不等于撤销，请检查文件状态。", "命令以主機帳戶執行，可修改工作區外檔案、存取網路或變更全域設定。請備份重要檔案；執行失敗（包括非零結束）、停止或超限終止不等於復原，請檢查檔案狀態。", "ホストのアカウントで実行され、作業領域外のファイル変更、ネットワークへのアクセス、全体設定の変更が可能です。重要なファイルをバックアップしてください。失敗（終了コードが非ゼロの場合を含む）、停止、上限による強制終了は変更を取り消しません。ファイルを確認してください。"],
  programValue: ["Program: {{value}}", "程序：{{value}}", "程式：{{value}}", "プログラム：{{value}}"],
  directoryValue: ["Working directory: {{value}}", "工作目录：{{value}}", "工作目錄：{{value}}", "作業ディレクトリ：{{value}}"],
  cancel: ["Cancel", "取消", "取消", "キャンセル"],
  confirmRun: ["Confirm and run", "确认运行", "確認執行", "確認して実行"],
  interactive: ["Interactive editing", "交互编辑", "互動編輯", "対話型編集"],
  liveSelect: ["Live preview / selection", "实时预览/选择", "即時預覽/選取", "ライブプレビュー・選択"],
  spreadsheetHint: ["Double-click cells to edit; drag charts", "双击单元格编辑，拖动图表", "按兩下儲存格編輯，拖曳圖表", "セルをダブルクリックして編集、グラフをドラッグ"],
  selectionHint: ["Live preview and selection; text cannot be edited in place", "实时预览和选择，不能原位编辑文本", "即時預覽和選取，無法原位編輯文字", "ライブプレビューと選択。テキストの直接編集はできません"],
  backPreview: ["Back to preview", "返回预览", "返回預覽", "プレビューに戻る"],
  refreshing: ["Refreshing", "刷新中", "重新整理中", "更新中"],
  refreshPreview: ["Refresh preview", "刷新预览", "重新整理預覽", "プレビューを更新"],
  saveHint: ["Runs the official save command without closing the resident", "调用官方 save，不关闭 resident", "呼叫官方 save，不關閉 resident", "公式 save を実行。resident は閉じません"],
  reload: ["Reload", "重载", "重新載入", "再読み込み"],
  reloadHint: ["Reopen the official page", "重新打开官方页面", "重新開啟官方頁面", "公式ページを開き直す"],
  previewPlatform: ["Open OfficeCLI preview in Paseo desktop or a browser. Native mobile clients are not supported yet.", "请在 Paseo 桌面端或浏览器打开 OfficeCLI 预览。手机原生客户端暂不支持。", "請在 Paseo 桌面版或瀏覽器開啟 OfficeCLI 預覽。手機原生用戶端暫不支援。", "Paseo デスクトップ版またはブラウザで開いてください。モバイルのネイティブクライアントには未対応です。"],
  selectionRace: ["Another window referenced a selection. Click again.", "其他窗口已引用选区，请再点一次。", "其他視窗已引用選取範圍，請再按一次。", "別のウィンドウが選択範囲を参照しました。もう一度クリックしてください。"],
  referencing: ["Referencing", "引用中", "引用中", "参照中"],
  referenceSelection: ["Reference selected objects", "引用选中区域", "引用選取範圍", "選択オブジェクトを参照"],
  selectionLimit: ["Select at most {{count}} objects", "最多选择 {{count}} 个对象", "最多選取 {{count}} 個物件", "最大 {{count}} 個のオブジェクトを選択できます"],
  selectFirst: ["Click a paragraph or object, then reference it.", "点击段落或对象后再引用。", "按一下段落或物件後再引用。", "段落またはオブジェクトをクリックしてから参照してください。"],
  connectionUnavailable: ["Interactive connection unavailable; read-only preview and advanced commands remain available.", "交互连接不可用；只读预览和高级命令仍可使用。", "互動連線無法使用；唯讀預覽和進階命令仍可使用。", "対話型接続を利用できません。読み取り専用プレビューと詳細コマンドは使用できます。"],
  selectionTitle: ["Office selection · {{file}} · {{workspace}}", "Office 选区 · {{file}} · {{workspace}}", "Office 選取範圍 · {{file}} · {{workspace}}", "Office 選択範囲 · {{file}} · {{workspace}}"],
  selectionPicker: ["Add Office selection · {{file}}", "添加 Office 选区 · {{file}}", "新增 Office 選取範圍 · {{file}}", "Office 選択範囲を追加 · {{file}}"],
  selectionSearch: ["Choose a prepared selection", "选择已准备的选区", "選擇已準備的選取範圍", "準備済みの選択範囲を選択"],
} as const;

export type MessageKey = keyof typeof catalog;
export const locales = ["en", "zh-CN", "zh-TW", "ja"] as const;
export type Locale = typeof locales[number];
export const languageNames: Record<Locale, string> = { en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文", ja: "日本語" };
export const resources = Object.fromEntries(locales.map((locale, index) => [locale, Object.fromEntries(Object.entries(catalog).map(([key, row]) => [key, row[index]]))])) as Record<Locale, Record<MessageKey, string>> & { en: { [K in MessageKey]: typeof catalog[K][0] } };

export function normalizeLocale(value: string): Locale {
  const parts = value.toLowerCase().replaceAll("_", "-").split("-");
  if (parts[0] === "en") return "en";
  if (parts[0] === "ja") return "ja";
  if (parts[0] === "zh") {
    if (parts.includes("hant")) return "zh-TW";
    if (parts.includes("hans")) return "zh-CN";
    if (parts.some((part) => ["tw", "hk", "mo"].includes(part))) return "zh-TW";
    if (parts.length === 1 || parts.some((part) => ["cn", "sg"].includes(part))) return "zh-CN";
  }
  return "en";
}

export function translate(locale: string, key: MessageKey, values: Record<string, unknown> = {}): string {
  const localized = resources[normalizeLocale(locale)][key];
  const template = typeof localized === "string" ? localized : resources.en[key];
  return (typeof template === "string" ? template : key).replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
}
