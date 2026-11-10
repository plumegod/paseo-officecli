import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { previewHtml } from "../client/preview-html.ts";

const html = "<!doctype html><html><head></head><body>Office preview</body></html>";

function layout({ width = 0, main = true, slides = true } = {}) {
  const container = main ? { clientWidth: width } : null;
  const frames = [], observers = [], fitted = [];
  let ready, fullscreen = false;
  const window = {};
  runInNewContext(previewHtml(html).match(/<script>([\s\S]*?)<\/script>/)[1], {
    window,
    document: {
      addEventListener: (event, callback, options) => {
        assert.equal(event, "DOMContentLoaded"); assert.equal(options.once, true); ready = callback;
      },
      querySelector: (selector) => { assert.equal(selector, ".main"); return container; },
      body: { classList: { contains: (name) => name === "fullscreen" && fullscreen } },
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { assert.equal(target, container); }
    },
  });
  // Official scripts define this after the injected head script, before DOMContentLoaded.
  if (slides) window.scaleSlides = () => fitted.push(container.clientWidth);
  ready();
  return {
    fitted, observers, frames,
    flush: () => frames.splice(0).forEach((callback) => callback()),
    resize: (width) => { container.clientWidth = width; observers.forEach((observer) => observer.callback()); },
    fullscreen: (value) => { fullscreen = value; },
  };
}

test("preview keeps the original document, CSP and watch bridge before official scripts", () => {
  const original = html.replace("<head>", '<HEAD data-preview="yes">').replace("</body>", "<script>official()</script></body>");
  const bridge = "<script>/* transport $& $` $' */</script>";
  const rendered = previewHtml(original, bridge);
  assert.ok(rendered.startsWith('<!doctype html><html><HEAD data-preview="yes"><meta http-equiv="Content-Security-Policy"'));
  assert.ok(rendered.includes("default-src 'none'"));
  assert.ok(rendered.includes("script-src 'unsafe-inline'"));
  assert.ok(rendered.includes(bridge), "transport source is inserted literally");
  assert.ok(rendered.indexOf(bridge) < rendered.indexOf("new ResizeObserver"));
  assert.ok(rendered.endsWith("<script>official()</script></body></html>"));
});

test("PPTX fits after an initially zero-width container is revealed without a window resize", () => {
  const page = layout();
  assert.equal(page.observers.length, 1);
  page.flush();
  assert.deepEqual(page.fitted, [], "never scale against an invisible container");
  page.resize(770); page.flush();
  assert.deepEqual(page.fitted, [770], "the missing resize event must not leave a full-sized slide clipped");
  page.resize(770); page.flush();
  assert.deepEqual(page.fitted, [770], "height-only changes caused by scaling cannot feed back");
  page.resize(0); page.flush(); page.resize(770); page.flush();
  assert.deepEqual(page.fitted, [770, 770], "returning to the same width after hiding still refits");
  page.resize(600); page.resize(500);
  assert.equal(page.frames.length, 1, "coalesce rapid panel layout changes");
  page.flush();
  assert.deepEqual(page.fitted, [770, 770, 500]);
});

test("PPTX fits on first load and leaves fullscreen scaling to OfficeCLI", () => {
  const page = layout({ width: 770 });
  page.flush(); assert.deepEqual(page.fitted, [770]);
  page.fullscreen(true); page.resize(900); page.flush();
  assert.deepEqual(page.fitted, [770]);
  page.fullscreen(false); page.resize(770); page.flush();
  assert.deepEqual(page.fitted, [770, 770]);
});

test("Word and Excel previews without the PPTX scaling API remain unchanged", () => {
  for (const options of [{ main: false }, { slides: false }]) {
    const page = layout(options);
    assert.equal(page.observers.length, 0); assert.equal(page.frames.length, 0);
  }
});
