import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { catalog, locales, resources } from "../shared/locales.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const resourceFiles = new Set(["shared/locales.ts", "shared/error-messages.ts"]);
const uiProps = /^(?:label|hint|title|summary|placeholder|searchPlaceholder|pickerTitle|description|accessibilityLabel|accessibilityHint|actionLabel|error|emptyText|loadingText|text)$/;
const prose = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|\p{L}[\p{L}\p{N},;:!?.’'()–/-]*\s+\p{L}/u;
// Protocol tokens and raw error detail prefixes; not UI copy.
const technical = new Set(["stdin: ", "utf8", "content-type", "text/event-stream", "Content-Type", "application/json", "View mode: ", "view html", "EventSource('/events')"]);

export function policyViolations(source, name) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const failures = [];
  const bindings = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bindings.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(file);
  const resolving = new Set();
  function report(node, reason) { const { line } = file.getLineAndCharacterOfPosition(node.getStart(file)); failures.push(`${name}:${line + 1}: ${reason}`); }
  function literals(node, strict = false) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return; // Runtime data; local text properties are checked at their producer.
    if (strict && ts.isIdentifier(node) && bindings.has(node.text) && !resolving.has(node.text)) {
      resolving.add(node.text); literals(bindings.get(node.text), true); resolving.delete(node.text); return;
    }
    if (ts.isCallExpression(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return; // Nested elements have their own sinks.
    if (ts.isConditionalExpression(node)) { literals(node.whenTrue, strict); literals(node.whenFalse, strict); return; }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) return;
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text.trim();
      if (text && !technical.has(node.text) && (strict ? /\p{L}/u.test(text) : prose.test(text))) report(node, "hardcoded copy must use the shared catalog");
    }
    ts.forEachChild(node, (child) => literals(child, strict));
  }
  function visit(node) {
    if (["client/preview-html.ts", "client/watch-bridge.ts"].includes(name) && (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      // Parse embedded scripts too: protocol builders are not a free pass for hardcoded errors/copy.
      const template = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((span) => "__injected__" + span.literal.text).join("") : node.text;
      const scripts = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      for (const script of scripts) failures.push(...policyViolations(script[1], `${name}.embedded.ts`));
      if (ts.isTemplateExpression(node)) for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    if (ts.isNewExpression(node) && node.expression.getText(file) === "RegExp") return; // Official help protocol matching, not UI.
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) report(node, "literal JSX text");
    if (ts.isJsxAttribute(node) && uiProps.test(node.name.getText(file)) && node.initializer) literals(node.initializer, true);
    if (ts.isPropertyAssignment(node) && uiProps.test(node.name.getText(file).replaceAll(/['"]/g, ""))) literals(node.initializer, true);
    if (ts.isJsxElement(node) && /^(Text|Modal\.Title)$/.test(node.openingElement.tagName.getText(file))) {
      for (const child of node.children) if (ts.isJsxExpression(child) && child.expression) literals(child.expression, true);
    }
    if (ts.isNewExpression(node) && node.expression.getText(file) === "Error" && node.arguments?.[0]) literals(node.arguments[0], true);
    if (ts.isCallExpression(node) && /^(?:setError|setCopyError)$/.test(node.expression.getText(file)) && node.arguments[0]) literals(node.arguments[0], true);
    if (ts.isCallExpression(node) && /^(?:t|message|messages\.message)$/.test(node.expression.getText(file))) {
      const key = node.arguments[0];
      if (key && ts.isStringLiteral(key) && !(key.text in catalog)) report(key, "unknown translation key");
    }
    if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && !technical.has(node.text) && prose.test(node.text)) {
      // Technical HTML/CSS and command protocol builders are exempt as complete modules below.
      report(node, "prose outside the catalog");
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...new Set(failures)];
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "artifacts", "tests", "examples"].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("all shipped source participates in the i18n policy", () => {
  const failures = [];
  for (const path of files(root)) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (resourceFiles.has(name)) continue;
    failures.push(...policyViolations(readFileSync(path, "utf8"), name));
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("policy rejects new English/CJK copy, accessibility text and errors", () => {
  for (const source of [
    '<Text>Hello</Text>', '<ActionButton label="Save" />', '<Text>{busy ? "Loading" : "Ready"}</Text>',
    '<TextInput accessibilityLabel="名前" />', 'throw new Error("Something failed")',
    'const help = "New feature help";', 'setError("错误")', 't("missingTranslationKey")',
    'const label = "Save"; <ActionButton label={label} />', 'const chrome = { label: "Ready" };',
  ]) assert.ok(policyViolations(source, "new-feature.tsx").length, source);
  assert.deepEqual(policyViolations('<Text>{t("save")}</Text>', "new-feature.tsx"), []);
});

test("four complete local resources have identical interpolation parameters", () => {
  assert.deepEqual(locales, ["en", "zh-CN", "zh-TW", "ja"]);
  const parameters = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
  for (const [key, row] of Object.entries(catalog)) {
    assert.equal(row.length, 4, key);
    for (const locale of locales) {
      const text = resources[locale][key];
      assert.equal(typeof text, "string", `${locale}:${key}`);
      assert.ok(text.trim(), `${locale}:${key}`);
      assert.deepEqual(parameters(text), parameters(resources.en[key]), `${locale}:${key}`);
    }
  }
});
