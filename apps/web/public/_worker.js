export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = 'https://hanzi-viet.onrender.com' + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.delete('host');
      return fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
      });
    }
    return env.ASSETS.fetch(request);
  }
};