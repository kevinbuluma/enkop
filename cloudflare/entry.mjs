// Worker entry for the ENKOP master. Copied next to the Nitro build as .output/server/enkop-entry.mjs
// by cloudflare/scripts/install-entry.mjs, so `./index.mjs` is the Nitro handler.
// Workers Static Assets ignores Range headers; Safari will not play <video> without 206 responses,
// so /videos/* (routed here by assets.run_worker_first) is served with byte ranges.
import nitro from './index.mjs';

const VIDEO = /^\/videos\/[\w./-]+\.(mp4|webm)$/;

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

function slice(body, start, end) {
  const reader = body.getReader();
  let pos = 0;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        const from = pos;
        pos += value.byteLength;
        if (pos <= start) continue;
        controller.enqueue(value.subarray(Math.max(0, start - from), Math.min(value.byteLength, end + 1 - from)));
        if (pos > end) {
          controller.close();
          await reader.cancel();
        }
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function serveVideo(request, env) {
  let asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
  if (!asset.ok || !asset.body) return asset;
  let size = Number(asset.headers.get('content-length'));
  if (!size) {
    // The assets binding streams without a length; buffer once to learn it (hero files are < 10 MB).
    const bytes = await asset.arrayBuffer();
    size = bytes.byteLength;
    asset = new Response(bytes, asset);
  }
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  const header = request.headers.get('range');
  if (!header) return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers });
  const range = parseRange(header, size);
  if (!range) {
    await asset.body.cancel();
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const length = range.end - range.start + 1;
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('Content-Length', String(length));
  if (request.method === 'HEAD') {
    await asset.body.cancel();
    return new Response(null, { status: 206, headers });
  }
  const { readable, writable } = new FixedLengthStream(length);
  slice(asset.body, range.start, range.end).pipeTo(writable).catch(() => {});
  return new Response(readable, { status: 206, headers });
}

export default {
  ...nitro,
  fetch(request, env, ctx) {
    if ((request.method === 'GET' || request.method === 'HEAD') && env.ASSETS && VIDEO.test(new URL(request.url).pathname)) {
      return serveVideo(request, env);
    }
    return nitro.fetch(request, env, ctx);
  },
};
