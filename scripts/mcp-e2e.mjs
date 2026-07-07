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

  // Discover real IDs from the running backend (works against local OR prod,
  // whose seeded IDs differ).
  const restaurants = JSON.parse(textOf(await call("list_restaurants", {})));
  const rid = restaurants[0].id;
  const menu = JSON.parse(textOf(await call("get_restaurant_menu", { restaurant_id: rid })));
  const items = menu.slice(0, 2).map((m) => ({ menu_item: m.id, quantity: 1 }));
  console.log(`2) using restaurant #${rid} (${restaurants[0].name}), items ${items.map((i) => i.menu_item).join(",")}`);

  const placed = textOf(await call("place_order", {
    restaurant_id: rid,
    delivery_address: "500 MCP Lane, AI City",
    items,
  }));
  console.log("3) place_order:", placed);
  const orderId = Number(placed.match(/Order ID: (\d+)/)?.[1]);
  if (!orderId) { console.error("\n❌ place_order did not return an order id"); server.kill(); process.exit(1); }

  const payResult = textOf(await call("pay_for_order", { order_id: orderId }));
  console.log("4) pay_for_order:", payResult);
  if (/PAID/.test(payResult)) {
    console.log("\n✅ MCP placed AND paid for an order end-to-end.");
    server.kill();
    process.exit(0);
  }
  console.error("\n❌ payment did not complete");
  server.kill();
  process.exit(1);
}
main().catch((e) => { console.error(e); server.kill(); process.exit(1); });
