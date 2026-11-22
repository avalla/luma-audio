// Local static server for the web apps: bun scripts/serve.ts <dir> <port> [fallback dirs]
import { resolve, sep } from "node:path";

const [dir, portArg, ...fallbacks] = Bun.argv.slice(2);
const port = Number(portArg);
if (!dir || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Usage: bun scripts/serve.ts <dir> <port> [fallback dirs]");
  process.exit(1);
}
const roots = [dir, ...fallbacks].map((path) => resolve(path));

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (path.endsWith("/")) path += "index.html";
    for (const root of roots) {
      const target = resolve(root, `.${path}`);
      if (!target.startsWith(root + sep)) return new Response("Forbidden", { status: 403 });
      const file = Bun.file(target);
      if (await file.exists()) return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(`Serving ${roots[0]} at http://127.0.0.1:${port}`);
