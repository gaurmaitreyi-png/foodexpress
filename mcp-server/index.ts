import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.FOODEXPRESS_API_URL || "http://localhost:8000/api";
let authToken: string | null = process.env.FOODEXPRESS_AUTH_TOKEN || null;

const server = new Server(
  {
    name: "foodexpress-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Update auth header whenever token changes
const updateAuthHeader = (token: string) => {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

if (authToken) {
  updateAuthHeader(authToken);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "login",
        description: "Login to FoodExpress to get an auth token",
        inputSchema: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
          required: ["username", "password"],
        },
      },
      {
        name: "list_restaurants",
        description: "Get a list of available restaurants",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_restaurant_menu",
        description: "Get the menu for a specific restaurant",
        inputSchema: {
          type: "object",
          properties: {
            restaurant_id: { type: "number" },
          },
          required: ["restaurant_id"],
        },
      },
      {
        name: "place_order",
        description: "Place a food order",
        inputSchema: {
          type: "object",
          properties: {
            restaurant_id: { type: "number" },
            delivery_address: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  menu_item: { type: "number", description: "The ID of the menu item" },
                  quantity: { type: "number", minimum: 1 },
                },
                required: ["menu_item", "quantity"],
              },
            },
          },
          required: ["restaurant_id", "delivery_address", "items"],
        },
      },
      {
        name: "get_orders",
        description: "Get order history for the current user",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "cancel_order",
        description: "Cancel a pending order",
        inputSchema: {
          type: "object",
          properties: {
            order_id: { type: "number" },
          },
          required: ["order_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "login": {
        const { username, password } = args as any;
        const response = await api.post("/auth/login/", { username, password });
        authToken = response.data.access;
        if (authToken) {
          updateAuthHeader(authToken);
        }
        return {
          content: [{ type: "text", text: "Login successful. Token acquired." }],
        };
      }

      case "list_restaurants": {
        const response = await api.get("/restaurants/");
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
        };
      }

      case "get_restaurant_menu": {
        const { restaurant_id } = args as any;
        const response = await api.get(`/restaurants/${restaurant_id}/menu/`);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
        };
      }

      case "place_order": {
        if (!authToken) {
          return {
            isError: true,
            content: [{ type: "text", text: "You must login first using the login tool." }],
          };
        }
        const { restaurant_id, delivery_address, items } = args as any;
        const response = await api.post("/orders/", {
          restaurant: restaurant_id,
          delivery_address,
          items,
        });
        return {
          content: [{ type: "text", text: `Order placed successfully! Order ID: ${response.data.id}` }],
        };
      }

      case "get_orders": {
        if (!authToken) {
          return {
            isError: true,
            content: [{ type: "text", text: "You must login first using the login tool." }],
          };
        }
        const response = await api.get("/orders/");
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
        };
      }

      case "cancel_order": {
        if (!authToken) {
          return {
            isError: true,
            content: [{ type: "text", text: "You must login first using the login tool." }],
          };
        }
        const { order_id } = args as any;
        const response = await api.post(`/orders/${order_id}/cancel/`);
        return {
          content: [{ type: "text", text: `Order ${order_id} cancelled successfully.` }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error.response?.data?.detail || error.message || String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FoodExpress MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
