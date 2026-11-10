export function previewHtml(html: string, bridge = ""): string {
  // Keep official interactions while blocking external subresources; the sandbox isolates Paseo's origin.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;">`;
  const layout = `<script>(function(){
    document.addEventListener('DOMContentLoaded', () => {
      const main = document.querySelector('.main');
      if (!main || typeof window.scaleSlides !== 'function') return;
      let width = -1, queued = false;
      function refit() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const next = main.clientWidth;
          if (next === width) return;
          width = next;
          if (next > 0 && !document.body.classList.contains('fullscreen')) window.scaleSlides();
        });
      }
      // The panel can become visible without a window resize after the CLI's first measurement.
      new ResizeObserver(refit).observe(main);
      refit();
    }, { once: true });
  })();</script>`;
  return html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + policy + bridge + layout);
}
