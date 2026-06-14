import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
dotenv.config();
const API_BASE_URL = process.env.FOODEXPRESS_API_URL || "http://localhost:8000/api";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
let authToken = process.env.FOODEXPRESS_AUTH_TOKEN || null;
// Initialize Gemini client. The model `gemini-2.5-flash` is fast and free-tier friendly.
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const geminiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.5-flash" }) : null;
const server = new Server({ name: "foodexpress-mcp", version: "0.2.0" }, { capabilities: { tools: {} } });
const api = axios.create({ baseURL: API_BASE_URL });
const updateAuthHeader = (token) => {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};
if (authToken) {
    updateAuthHeader(authToken);
}
// Helper: ask Gemini for a JSON response, parsing safely
async function askGeminiForJSON(prompt) {
    if (!geminiModel)
        throw new Error("Gemini not configured. Set GEMINI_API_KEY in .env");
    const result = await geminiModel.generateContent(prompt);
    let text = result.response.text().trim();
    // Strip code fences if present
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
    return JSON.parse(text);
}
async function askGeminiForText(prompt) {
    if (!geminiModel)
        throw new Error("Gemini not configured. Set GEMINI_API_KEY in .env");
    const result = await geminiModel.generateContent(prompt);
    return result.response.text().trim();
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
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_restaurant_menu",
                description: "Get the menu for a specific restaurant",
                inputSchema: {
                    type: "object",
                    properties: { restaurant_id: { type: "number" } },
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
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "cancel_order",
                description: "Cancel a pending order",
                inputSchema: {
                    type: "object",
                    properties: { order_id: { type: "number" } },
                    required: ["order_id"],
                },
            },
            // === AI-powered tools (Gemini) ===
            {
                name: "recommend_dish",
                description: "Uses Gemini AI to recommend a dish from FoodExpress restaurants based on the user's preferences, mood, dietary needs, or cravings.",
                inputSchema: {
                    type: "object",
                    properties: {
                        preferences: {
                            type: "string",
                            description: "What the user wants (e.g. 'something spicy and vegetarian under 300 rupees' or 'comfort food for a rainy evening').",
                        },
                    },
                    required: ["preferences"],
                },
            },
            {
                name: "summarize_my_orders",
                description: "Uses Gemini AI to summarize the current user's order history into a friendly paragraph with insights about their eating habits.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "smart_order",
                description: "Uses Gemini AI to decide what to order based on a natural-language request, then actually places the order with FoodExpress. Example request: 'Order me something cheap and vegetarian, deliver to my home address.'",
                inputSchema: {
                    type: "object",
                    properties: {
                        request: {
                            type: "string",
                            description: "Natural language description of what to order and where to deliver it.",
                        },
                        delivery_address: {
                            type: "string",
                            description: "Where to deliver the order.",
                        },
                    },
                    required: ["request", "delivery_address"],
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
                const { username, password } = args;
                const response = await api.post("/auth/login/", { username, password });
                authToken = response.data.access;
                if (authToken)
                    updateAuthHeader(authToken);
                return { content: [{ type: "text", text: "Login successful. Token acquired." }] };
            }
            case "list_restaurants": {
                const response = await api.get("/restaurants/");
                return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
            }
            case "get_restaurant_menu": {
                const { restaurant_id } = args;
                const response = await api.get(`/restaurants/${restaurant_id}/menu/`);
                return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
            }
            case "place_order": {
                if (!authToken) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "You must login first using the login tool." }],
                    };
                }
                const { restaurant_id, delivery_address, items } = args;
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
                return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
            }
            case "cancel_order": {
                if (!authToken) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "You must login first using the login tool." }],
                    };
                }
                const { order_id } = args;
                const response = await api.post(`/orders/${order_id}/cancel/`);
                return {
                    content: [{ type: "text", text: `Order ${order_id} cancelled successfully.` }],
                };
            }
            // === AI-powered tools ===
            case "recommend_dish": {
                const { preferences } = args;
                // Fetch all restaurants + their menus
                const restRes = await api.get("/restaurants/");
                const restaurants = restRes.data;
                // For each restaurant, fetch detail (which includes menu)
                const fullData = await Promise.all(restaurants.map(async (r) => {
                    const detail = await api.get(`/restaurants/${r.id}/`);
                    return detail.data;
                }));
                const prompt = `You are a friendly food recommendation assistant for FoodExpress, a food delivery app.

The user said: "${preferences}"

Here are all the restaurants and their menus available right now:
${JSON.stringify(fullData, null, 2)}

Based on the user's preferences, recommend ONE specific dish from ONE specific restaurant. Be warm and conversational. Mention:
- The dish name and which restaurant it's from
- Why it matches what the user asked for
- The price
- The restaurant's rating and delivery time

Keep it under 120 words. Speak directly to the user.`;
                const recommendation = await askGeminiForText(prompt);
                return { content: [{ type: "text", text: recommendation }] };
            }
            case "summarize_my_orders": {
                if (!authToken) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "You must login first using the login tool." }],
                    };
                }
                const ordersRes = await api.get("/orders/");
                const orders = ordersRes.data;
                if (!orders || orders.length === 0) {
                    return {
                        content: [{ type: "text", text: "You haven't placed any orders yet. Time to try something new!" }],
                    };
                }
                const prompt = `You are a friendly assistant analyzing a FoodExpress user's order history.

Here is the user's order history:
${JSON.stringify(orders, null, 2)}

Write a warm, friendly summary (under 150 words) that includes:
- How many orders they've placed
- Their favorite restaurant or cuisine if there's a pattern
- The total amount spent
- A fun observation or recommendation based on their habits
- Their most-ordered dish if there is one

Speak directly to the user in a casual tone.`;
                const summary = await askGeminiForText(prompt);
                return { content: [{ type: "text", text: summary }] };
            }
            case "smart_order": {
                if (!authToken) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "You must login first using the login tool." }],
                    };
                }
                const { request: userRequest, delivery_address } = args;
                // Get all restaurants + menus to give Gemini full context
                const restRes = await api.get("/restaurants/");
                const restaurants = restRes.data;
                const fullData = await Promise.all(restaurants.map(async (r) => {
                    const detail = await api.get(`/restaurants/${r.id}/`);
                    return detail.data;
                }));
                // Ask Gemini to pick what to order, returning structured JSON
                const decisionPrompt = `You are an AI assistant that picks food orders for a user.

User's request: "${userRequest}"

Available restaurants and menus:
${JSON.stringify(fullData, null, 2)}

Based on the request, pick ONE restaurant and 1-3 menu items that best match. Respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "restaurant_id": <number>,
  "items": [{"menu_item": <number>, "quantity": <number>}, ...],
  "reasoning": "<one sentence explaining your choice>"
}`;
                const decision = await askGeminiForJSON(decisionPrompt);
                // Actually place the order
                const orderRes = await api.post("/orders/", {
                    restaurant: decision.restaurant_id,
                    delivery_address,
                    items: decision.items,
                });
                const summary = `Order placed by AI! Order ID: ${orderRes.data.id}
Total: ${orderRes.data.total_price}
Reasoning from Gemini: ${decision.reasoning}
Items ordered: ${decision.items.length}`;
                return { content: [{ type: "text", text: summary }] };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
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
    console.error("FoodExpress MCP Server v0.2 running on stdio (with Gemini AI)");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
