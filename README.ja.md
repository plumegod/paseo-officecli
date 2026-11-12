# Paseo OfficeCLI

公式の [OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) を使って、[Paseo](https://github.com/getpaseo/paseo) 内で Word、Excel、PowerPoint ファイルをプレビュー・操作できます。

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[![Checks](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml/badge.svg)](https://github.com/plumegod/paseo-officecli/actions/workflows/check.yml)
[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[機能](#features) · [インストール](#installation) · [使い方](#usage) · [安全性](#safety) · [開発](#development)

<a id="features"></a>
## 機能

- **ファイルパネルでプレビュー。** OfficeCLI の HTML レンダラーで `.docx`、`.xlsx`、`.pptx` を開き、ワークシートの切り替えや複数スライドの閲覧ができます。ディスク上の変更に応じてプレビューが更新されます。
- **Excel を対話的に編集。** 公式 watch ページでセルの文字を編集し、グラフをドラッグして、OfficeCLI で保存できます。
- **Word と PowerPoint の選択内容を参照。** 選択したオブジェクトのスナップショットを、現在のワークスペースの会話に添付できます。メッセージは自動送信されません。
- **必要に応じて CLI の全機能を利用。** 詳細コマンドでは JSON 引数配列と標準入力を使用でき、実行確認、stdout/stderr、実行状況、停止操作に対応します。シェルを介さず、コマンドの固定ホワイトリストもありません。
- **表示言語を個別に選択。** Paseo に合わせるか、プラグイン用に English、简体中文、繁體中文、日本語を選べます。

> Word と PowerPoint の対話ページはライブプレビューとオブジェクト選択に対応しますが、**その場でのテキスト編集には対応していません**。その他の編集には詳細コマンド、Paseo エージェント、またはターミナルを使ってください。

<a id="requirements"></a>
## 動作要件

| コンポーネント | 要件 |
| --- | --- |
| Paseo | trusted plugins を有効にした **0.16.0-beta.1 以降** |
| OfficeCLI | daemon が動作するマシンにインストールした公式安定版 **1.0.160 以降** |
| Git | 下記の Git ソースからのインストール用に daemon のマシンで利用可能であること |
| クライアント | Paseo デスクトップ版またはモダンブラウザー。ネイティブモバイルでの Office プレビューは非対応 |

OfficeCLI のインストールと更新は別途行います。このプラグインはバイナリを同梱・フォーク・固定しません。今後の安定版では公開 CLI と watch インターフェースの互換性が必要です。上流に破壊的変更がある場合、プラグインの更新が必要になることがあります。

<a id="installation"></a>
## インストール

1. **Paseo daemon が動作するマシンで**[OfficeCLI の公式インストール手順](https://github.com/iOfficeAI/OfficeCLI#installation)に従い、次のコマンドを確認します。

   ```sh
   officecli --version
   ```

2. このプラグインのソースとホスト権限を確認します。対象 daemon の **Paseo 設定 → プラグイン**でプラグインを有効にし、そのマシンで次を実行します。

   ```sh
   paseo plugin install https://github.com/plumegod/paseo-officecli.git
   paseo plugin ls
   ```

   状態が `running` であることを確認してください。表示されない、または失敗した場合は、対象 daemon と全体の有効化スイッチを確認し、`paseo plugin logs paseo-officecli` を調べます。この Git インストールには `npm install` や別途のビルドは不要で、実行時モジュールとソースのコンパイルは Paseo が提供します。

3. **Paseo 設定 → プラグイン → paseo-officecli → OfficeCLI** を開き、検出された実行ファイルとバージョンを確認します。独自の場所にインストールした場合のみ、実行ファイルの絶対パスを指定して保存してください。検出には daemon アカウントの環境が使われ、ターミナルの環境と異なる場合があります。サイドバーに専用ワークベンチは追加されません。
4. ワークスペースのファイルツリーで Office ファイルを開き、**OfficeCLI** を選びます。選択を記憶する場合は、次回から確認しない設定を有効にしてください。**設定 → ファイル** でも既定の開き方を指定できます。他の Office プラグインを削除する必要はありません。

プラグインを更新するには、次を実行します。

```sh
paseo plugin update paseo-officecli
```

このコマンドで更新されるのはプラグインだけです。OfficeCLI は公式手順で別途更新し、プラグイン設定でパスとバージョンを再確認したうえで、対話ページを開き直してください。詳しくは[検出と更新の説明](docs/USAGE.md#officecli)（英語）をご覧ください。

<a id="usage"></a>
## 使い方

### プレビューと対話ページ

Word と PowerPoint は初回に**選択モード**で開き、読み取り専用の**閲覧モード**へ直接切り替えられます。Excel は初回に**閲覧モード**で開き、**編集モード**へ切り替えられます。このクライアントではファイル形式ごとに最後の選択を記憶し、開き直しや再起動後も維持します。ファイルのツールバー、またはプラグイン設定の **OfficeCLI → 文書モード**で変更できます。対話モードは OfficeCLI 自身の watch サービスを使用し、現在の元ファイルに対応する変更を加えられます。

**保存**で公式の保存コマンドを実行します。ページを離れることは、保存や元に戻す操作にはなりません。Word と PowerPoint ではオブジェクトを選び、**選択オブジェクトを参照**から会話への添付を準備できます。スナップショットにはファイルパスとオブジェクトの内容が含まれるため、機密情報を AI に送信する前に確認してください。

### 詳細コマンド

開いているファイル内で**詳細コマンド**を選び、`officecli` の接頭辞を**含めずに** JSON 文字列配列を入力します。例：

```json
["set", "draft.docx", "/body/p[1]", "--prop", "text=Updated from Paseo"]
```

各項目が一つの引数になります。相対パスは現在のワークスペースを基準に解決されます。Windows パスのバックスラッシュは `\\` にエスケープしてください。実行前の確認ダイアログで、実行ファイル、作業ディレクトリ、引数、権限を確認します。

バッチ処理や対話プロトコルには標準入力欄を展開して使います。`|`、`&&`、`>` などのシェル演算子は解釈されません。コマンドを推測せず、現在の公式ヘルプを確認してください。

```json
["help"]
```

バッチ入力、出力上限、タスクの停止、選択スナップショット、watch のライフサイクルについては[使い方ガイド](docs/USAGE.md)（英語）をご覧ください。[サンプルファイル](examples/)は統合テストでも使用します。

<a id="language"></a>
## 表示言語

**Paseo 設定 → プラグイン → paseo-officecli → OfficeCLI → 言語**を開きます。既定は **Paseo に合わせる**で、English、简体中文、繁體中文、日本語を個別に選べます。

設定は現在のデスクトップ／ブラウザークライアント内に保存され、Paseo 全体の言語や daemon の設定は変更しません。言語を切り替えても、下書き、タスク、出力、選択内容、対話セッションは維持されます。OfficeCLI のコマンド、未加工の出力、文書内容、公式ページは翻訳しません。ホストが表示する入口のタイトルは引き続き Paseo の言語に従います。

<a id="safety"></a>
## 安全性と制限

- **信頼されたホスト実行であり、ファイルシステムのサンドボックスではありません。** 詳細コマンドは daemon のアカウントで動作し、ワークスペース外のファイル、ネットワーク、グローバル設定にアクセスできます。重要なファイルはバックアップしてください。失敗、停止、上限による終了でも、適用済みの変更は**元に戻りません**。
- **プレビューと編集では権限が異なります。** 読み取り専用プレビューは元ファイルを変更しません。対話モードはローカル watch サービスを起動し、対応する編集を元ファイルに適用できます。プレビューと対話ページのパスは実際のワークスペース境界で検証されます。
- **信頼できない文書は依然として危険です。** 公式 HTML は `allow-scripts` のみを許可した分離 iframe で動作し、外部リソースはブロックされます。ただし、完全な文書セキュリティサンドボックスやネットワークファイアウォールではありません。不審な文書内リンクは開かないでください。
- **明示的に保存してください。** プラグインは OfficeCLI resident の自動保存方針を変更せず、終了時に自動保存せず、ユーザーが起動した resident/watch サービスも終了しません。書き込みがタイムアウトしても適用済みの場合があるため、再試行前に確認してください。
- **Microsoft Office と同じ描画ではありません。** 旧形式 `.doc` / `.xls` / `.ppt`、暗号化ファイル、ネイティブモバイルのプレビューには対応しません。外部フォント、数式ライブラリ、3D リソースはブロックされ、複雑なレイアウトは異なる場合があります。

正確な上限やリモートアクセスの動作は[使い方ガイド](docs/USAGE.md)（英語）をご覧ください。不具合は [Issues](https://github.com/plumegod/paseo-officecli/issues) に、Paseo/OfficeCLI のバージョンと機密情報を除いたログを添えて報告してください。プレビューのレイアウト問題を報告する前に、[既知の問題](https://github.com/plumegod/paseo-officecli/issues/1)も確認してください。

<a id="development"></a>
## 開発

**Node.js 22.18 以降**を使用してください。実行時の SDK とクライアントモジュールは Paseo が提供するため、追加の実行時依存関係はありません。

```sh
npm ci
npm run typecheck
npm test
npm run test:regression
npm run test:integration
```

最後の二つのコマンドには公式 OfficeCLI のインストールが必要で、見つからない場合は失敗します。統合テストは一時文書を使います。watch テストは resident／保存動作も確認するため、約二分かかります。GitHub Actions は Windows、macOS、Linux で型検査と単体／ポリシー／文書／パッケージテストを実行し、チェックサムを固定した **1.0.160** バイナリで OfficeCLI の統合テストを行います。検証対象はサポートの基準版であり、将来の任意の版を保証するものではありません。

CI では公式の `@getpaseo/cli@0.16.0-beta.1` を一時プレフィックスにインストールし、`PASEO_CLI_ENTRYPOINT` をその `dist/index.js` に設定して `npm run test:install` を実行します。このテストは loopback のみで待ち受ける独立した daemon に、プラグインの `node_modules` を含まないパッケージ済みソースをインストールし、`running`、再読み込み、ログ、削除を確認します。既存 daemon のプラグイン設定は有効にしません。`package.json` は private のままです。現在サポートする公開元は Git であり、未公開の npm パッケージではありません。リビジョンを共有する前に全 CI ジョブの成功を必須とし、その正確な Git リビジョンをテスト用 daemon にインストールして確認してください。

ローカルにインストールする場合は、先に同じプラグイン ID の既存インストール元を削除してから実行します。

```sh
paseo plugin install .
paseo plugin reload paseo-officecli
```

貢献前に [AGENTS.md](AGENTS.md) と[実行時の国際化規約](docs/I18N.md)（英語）を読んでください。どの README への変更依頼でも、**同じ変更内で三言語すべてを更新**します。共通の節アンカー、リンク、バージョン番号、コマンド例は `npm test` で検査し、CI は言語ファイルの更新漏れを拒否します。翻訳の意味は別途レビューが必要です。

<a id="license"></a>
## ライセンス

[MIT](LICENSE)。独立したプロジェクトであり、Paseo または iOfficeAI の公式製品ではありません。OfficeCLI 自身のライセンスは[上流リポジトリ](https://github.com/iOfficeAI/OfficeCLI)で管理されており、このリポジトリではそのバイナリを配布しません。
