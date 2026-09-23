/**
 * Playground server. No dependencies.
 *
 *   npm run example            → http://127.0.0.1:3000
 *
 * Bring your own key: paste a Jev API key into the page (sent per request in the
 * `x-jev-api-key` header, never stored or logged), or set TYPESAFE_API_KEY on the server.
 * With neither, the page uses the offline keyword baseline so you can still click around.
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { keywordProvider, type FilterProvider } from "../../src/index.ts";
import { jev } from "../../src/jev.ts";
import { createTicketFilter, ticketSearch, type Session } from "./tickets.ts";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);
const page = readFileSync(new URL("./playground.html", import.meta.url), "utf8");

type Ctx = Session & { jevKey?: string };

// Per-request key from the header, else the server's env key (ADR-0003).
const jevProvider = jev<Ctx>({ apiKey: (ctx) => ctx.jevKey ?? process.env.TYPESAFE_API_KEY ?? "" });
const offline = keywordProvider() as FilterProvider<Ctx>;
const withJev = createTicketFilter(jevProvider as FilterProvider<Session>);
const withKeywords = createTicketFilter(offline);

/** The trusted session. In a real app this comes from your auth middleware, never the body. */
function sessionFor(_req: IncomingMessage): Session {
  return { userId: "demo", workspaceId: "ws_acme", canSearchTickets: true };
}

async function readJson(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  });
  res.end(type === "application/json" ? JSON.stringify(body, null, 2) : String(body));
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") return send(res, 200, page, "text/html");
    if (req.method === "GET" && req.url === "/api/schema") {
      const fields = Object.fromEntries(
        Object.entries(ticketSearch.fields).map(([k, f]) => [k, { kind: f.kind, ...(f.kind === "enum" ? { values: Object.keys(f.values) } : {}), ...(f.description ? { description: f.description } : {}) }]),
      );
      return send(res, 200, { resource: ticketSearch.resource, fields, jevOnServer: Boolean(process.env.TYPESAFE_API_KEY) });
    }
    if (req.method !== "POST") return send(res, 404, { error: "not found" });

    const header = req.headers["x-jev-api-key"];
    const jevKey = typeof header === "string" && header.trim() ? header.trim().slice(0, 512) : undefined;
    const useJev = Boolean(jevKey || process.env.TYPESAFE_API_KEY);
    const context: Ctx = { ...sessionFor(req), ...(jevKey ? { jevKey } : {}) };
    const nf = useJev ? withJev : withKeywords;
    const body = await readJson(req);

    if (req.url === "/api/prepare") {
      const result = await nf.prepare(String(body.text ?? ""), { context });
      return send(res, 200, { provider: useJev ? "jev" : "keyword-baseline", result });
    }
    if (req.url === "/api/execute") {
      return send(res, 200, await nf.execute(body.filters, { context }));
    }
    return send(res, 404, { error: "not found" });
  } catch {
    // Never echo internals (or a key) back to the browser.
    return send(res, 400, { error: "bad request" });
  }
}).listen(PORT, HOST, () => {
  console.log(`JevFilter playground → http://${HOST}:${PORT}`);
  console.log(process.env.TYPESAFE_API_KEY ? "Using TYPESAFE_API_KEY from the environment." : "No server key: paste your Jev key in the page, or use the offline baseline.");
});
