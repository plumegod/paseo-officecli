// Transport adapters only: rendering, cell editing and chart dragging remain OfficeCLI's scripts.
export function watchBridge(channel: string, cursor: number): string {
  return `<script>(function(){
    const channel = ${JSON.stringify(channel)}, pending = new Map();
    let id = 0, cursor = ${cursor}, active;
    function call(kind, payload) {
      if (pending.size >= 8) return Promise.reject(new Error('Too many watch requests'));
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Watch request timed out; outcome unconfirmed. Do not blindly retry.')); }, 70000);
        pending.set(requestId, { resolve, reject, timer });
        parent.postMessage({ channel, id: requestId, kind, ...payload }, '*');
      });
    }
    window.addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.channel !== channel) return;
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id); clearTimeout(task.timer);
      if (event.data.error) task.reject(new Error(event.data.error)); else task.resolve(event.data.value);
    });
    window.fetch = function(url, options) {
      options = options || {};
      return call('request', { route: url, method: options.method || 'GET', body: options.body || '' })
        .then(result => new Response(result.body, { status: 200 }));
    };
    window.EventSource = class extends EventTarget {
      constructor(url) {
        super();
        if (url !== '/events') throw new Error('Unsupported watch event URL');
        if (active) active.close();
        active = this; this.readyState = 0; this.closed = false;
        const poll = async () => {
          try {
            const result = await call('events', { after: cursor });
            if (this.closed) return;
            if (result.reload) { this.close(); return; }
            if (this.readyState === 0) { this.readyState = 1; this.dispatchEvent(new Event('open')); }
            cursor = result.cursor;
            for (const event of result.events) this.dispatchEvent(new MessageEvent(event.type, { data: event.data, lastEventId: String(event.id) }));
            this.timer = setTimeout(poll, 1000);
          } catch (error) {
            if (!this.closed) { this.close(); this.dispatchEvent(new Event('error')); }
          }
        };
        this.timer = setTimeout(poll, 0);
      }
      close() { this.closed = true; this.readyState = 2; clearTimeout(this.timer); }
    };
  })();</script>`;
}
