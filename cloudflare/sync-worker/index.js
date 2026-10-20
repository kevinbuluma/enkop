// enkop-sync: every few minutes, asks the ENKOP master to push queued changes to the Lovable
// mirror. Talks to the master over a service binding, authenticated with ENKOP_INTERNAL_KEY.

async function drain(env) {
  const res = await env.MASTER.fetch('https://enkop.internal/api/public/enkop-master/drain', {
    method: 'POST',
    headers: { 'x-enkop-internal-key': env.ENKOP_INTERNAL_KEY },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`drain failed (${res.status}): ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(drain(env).then((r) => console.log('enkop-sync', JSON.stringify(r))));
  },
  // Manual trigger for checks: POST with the same internal key.
  async fetch(request, env) {
    if (request.method !== 'POST' || request.headers.get('x-enkop-internal-key') !== env.ENKOP_INTERNAL_KEY) {
      return new Response('Not found', { status: 404 });
    }
    return Response.json(await drain(env));
  },
};
