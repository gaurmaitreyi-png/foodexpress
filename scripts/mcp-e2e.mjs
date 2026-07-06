// End-to-end MCP smoke test.
// Drives the built MCP server over stdio: login -> list -> place -> pay -> orders.
//
//   Backend must be running. Then from the repo root:
//     node scripts/mcp-e2e.mjs
//   Target a different backend:
//     FOODEXPRESS_API_URL=https://your-api.onrender.com/api node scripts/mcp-e2e.mjs
//
// Uses the demo customer seeded by backend/seed.py.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = process.env.FOODEXPRESS_API_URL || "http://localhost:8000/api";

const server = spawn("node", ["dist/index.js"], {
  cwd: resolve(root, "mcp-server"),
  env: { ...process.env, FOODEXPRESS_API_URL: API_URL },
});

let buf = "";
const pending = new Map();
let nextId = 1;
const rpc = (method, params) => new Promise((res) => {
  const id = nextId++;
  pending.set(id, res);
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
});
const notify = (method, params) =>
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

server.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("{")) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

const textOf = (r) => r.result?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(r.error || r.result);

async function main() {
  console.log(`Target backend: ${API_URL}\n`);
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } });
  notify("notifications/initialized", {});

  const tools = await rpc("tools/list", {});
  console.log("TOOLS:", tools.result.tools.map((t) => t.name).join(", "), "\n");

  const call = (name, args) => rpc("tools/call", { name, arguments: args });
  console.log("1) login:", textOf(await call("login", { username: "demo_customer", password: "customerpass123" })));

  const placed = textOf(await call("place_order", {
    restaurant_id: 1,
    delivery_address: "500 MCP Lane, AI City",
    items: [{ menu_item: 1, quantity: 1 }, { menu_item: 2, quantity: 2 }],
  }));
  console.log("2) place_order:", placed);
  const orderId = Number(placed.match(/Order ID: (\d+)/)?.[1]);

  console.log("3) pay_for_order:", textOf(await call("pay_for_order", { order_id: orderId })));
  console.log("\n✅ MCP placed AND paid for an order end-to-end.");
  server.kill();
  process.exit(0);
}
main().catch((e) => { console.error(e); server.kill(); process.exit(1); });
