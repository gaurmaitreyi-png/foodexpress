try {
  const { spawn } = require('child_process');

  const child = spawn('npm', ['run', 'dev'], {
    cwd: 'mcp-server',
    shell: true
  });

  function send(msg) {
    console.log(`\n[CLIENT -> MCP] Sending: ${msg.method} (${msg.params?.name || 'init'})`);
    child.stdin.write(JSON.stringify(msg) + '\n');
  }

  child.stdout.on('data', (data) => {
    const raw = data.toString();
    try {
      const lines = raw.split('\n').filter(l => l.trim().startsWith('{'));
      for (const line of lines) {
        const json = JSON.parse(line);
        console.log(`[MCP -> CLIENT] Response ID ${json.id}:`, JSON.stringify(json.result, null, 2));
        
        if (json.id === 1) {
          send({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "list_restaurants", arguments: {} }
          });
        } else if (json.id === 2) {
          send({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "place_order",
              arguments: {
                restaurant_id: 1,
                delivery_address: "123 MCP Lane, AI City",
                items: [{ menu_item: 1, quantity: 1 }]
              }
            }
          });
        } else if (json.id === 3) {
          send({
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "get_orders", arguments: {} }
          });
        } else if (json.id === 4) {
          console.log("\n--- DEMO COMPLETE ---");
          child.kill();
          process.exit();
        }
      }
    } catch (e) {
      if (raw.trim()) console.log(`[MCP LOG]: ${raw.trim()}`);
    }
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('FoodExpress MCP Server running on stdio')) {
      console.log("[SYSTEM]: MCP Server is ready.");
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "login",
          arguments: { username: "testuser", password: "password123" }
        }
      });
    }
  });

  child.on('error', (err) => {
    console.error('Failed to start child process.', err);
  });

} catch (globalErr) {
  console.error('GLOBAL ERROR:', globalErr);
}
