// Worker entry for the ENKOP master. Copied next to the Nitro build as .output/server/enkop-entry.mjs
// by cloudflare/scripts/install-entry.mjs, so `./index.mjs` is the Nitro handler.
// - Workers Static Assets ignores Range headers; Safari will not play <video> without 206 responses,
//   so /videos/* (routed here by assets.run_worker_first) is served with byte ranges.
// - Lovable is the fallback: when a public page fails, the Lovable-hosted copy is served instead.
//   Admin, media and backend endpoints never fall back.
import nitro from './index.mjs';
import VIDEO_SIZES from './enkop-video-sizes.mjs';

const VIDEO = /^\/videos\/[\w./-]+\.(mp4|webm)$/;
const NO_FALLBACK = /^\/(admin|api\/admin\/|api\/public\/enkop-|media\/|api\/homepage-fallback)/;
const LOVABLE = 'https://enkop-real-estate.lovable.app';

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fromLovable(request, env, body) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const h of ['cookie', 'host', 'x-enkop-test-fallback']) headers.delete(h);
  const origin = String(env.ENKOP_BRIDGE_URL || LOVABLE).replace(/\/$/, '');
  const res = await fetch(`${origin}${url.pathname}${url.search}`, { method: request.method, headers, body, redirect: 'manual' });
  const out = new Response(res.body, res);
  out.headers.set('x-enkop-served-by', 'lovable-fallback');
  out.headers.set('cache-control', 'no-store');
  out.headers.delete('set-cookie');
  return out;
}

const fromAdmin = (request) => {
  try {
    return new URL(request.headers.get('referer') ?? '').pathname.startsWith('/admin');
  } catch {
    return false;
  }
};

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

// Videos keep their names when replaced, so cache for a day and revalidate in the background.
const VIDEO_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

async function serveVideo(request, env) {
  const header = request.headers.get('range');
  const pathname = new URL(request.url).pathname;
  // Use the assets binding's own Range support when it has it: no bytes pass through this Worker.
  let asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers: header ? { Range: header } : {} }));
  if (asset.status === 206) {
    const native = new Response(request.method === 'HEAD' ? null : asset.body, asset);
    native.headers.set('Accept-Ranges', 'bytes');
    native.headers.set('Cache-Control', VIDEO_CACHE);
    return native;
  }
  if (!asset.ok || !asset.body) return asset;
  // Sizes come from the build (enkop-video-sizes.mjs), so a range is streamed, never buffered whole.
  let size = Number(asset.headers.get('content-length')) || VIDEO_SIZES[pathname] || 0;
  if (!size) {
    const bytes = await asset.arrayBuffer();
    size = bytes.byteLength;
    asset = new Response(bytes, asset);
  }
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', VIDEO_CACHE);
  headers.delete('Content-Encoding');
  if (!header) headers.set('Content-Length', String(size));
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

// Only the master sets these: Lovable's editor previews the site in a cross-origin frame.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function secure(res) {
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(name)) out.headers.set(name, value);
  return out;
}

export default {
  ...nitro,
  async fetch(request, env, ctx) {
    return secure(await route(request, env, ctx));
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const read = request.method === 'GET' || request.method === 'HEAD';
  const serverFn = url.pathname.startsWith('/_serverFn/');
  const eligible = !NO_FALLBACK.test(url.pathname) && (read || (serverFn && request.method === 'POST')) && !(serverFn && fromAdmin(request));
  if (eligible && safeEqual(request.headers.get('x-enkop-test-fallback'), env.ENKOP_INTERNAL_KEY)) return fromLovable(request, env);

  if (read && env.ASSETS && VIDEO.test(url.pathname)) {
    const res = await serveVideo(request, env).catch(() => null);
    if (res && res.status < 500 && res.status !== 404) return res;
    return fromLovable(request, env).catch(() => res ?? new Response(null, { status: 502 }));
  }
  if (!eligible) return nitro.fetch(request, env, ctx);

  const body = read ? undefined : await request.clone().arrayBuffer();
  let res = null;
  try {
    res = await nitro.fetch(request, env, ctx);
  } catch (e) {
    console.error('[enkop] request failed; serving the Lovable fallback', e);
  }
  // Server functions answer ordinary errors with 500, so only infrastructure failures fall back.
  const failed = !res || (serverFn ? res.status >= 502 && res.status <= 504 : res.status >= 500);
  const assetMiss = res?.status === 404 && read && url.pathname.startsWith('/assets/');
  if (!failed && !assetMiss) return res;
  try {
    return await fromLovable(request, env, body);
  } catch (e) {
    console.error('[enkop] Lovable fallback unreachable', e);
    return res ?? new Response('ENKOP is temporarily unavailable. Please try again shortly.', { status: 503 });
  }
}
