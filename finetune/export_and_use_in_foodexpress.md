# Use your fine-tuned model in FoodExpress

FoodExpress already speaks **Ollama** — both the chatbot backend (`CHAT_PROVIDER`)
and the MCP server (`MCP_LLM_PROVIDER`). So the cleanest, free way to run your
fine-tuned model is Ollama. (A hosted HuggingFace API for a custom 3B model is
*not* free — see the note at the bottom.)

## Step 1 — Get the GGUF file
The Colab notebook (step 6) produces `foodexpress-qwen2.5-3b.gguf` and downloads it.
Put it next to this `Modelfile`.

## Step 2 — Create the Ollama model
Install Ollama from https://ollama.com, then:
```bash
ollama create foodexpress-llm -f Modelfile
ollama run foodexpress-llm "recommend something spicy and vegetarian"
```

## Step 3 — Point FoodExpress at it

### Local backend chatbot
In `backend/.env`:
```
CHAT_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=foodexpress-llm
```
Restart the Django server. The 💬 chatbot + `/assistant/order/` now use your model.

### MCP server (smart_order, recommend_dish)
In `mcp-server/.env`:
```
MCP_LLM_PROVIDER=ollama
OLLAMA_MODEL=foodexpress-llm
```
Rebuild (`npm run build`) and restart your MCP client.

## About "give me the API key" (the honest version)
- **Ollama** (above) needs no API key — it runs locally/self-hosted. This is the
  recommended path and it's free.
- **HuggingFace Inference:** serverless (free) inference does **not** reliably
  serve arbitrary custom 3B models. To get a real HTTP API + token for your
  model you'd deploy a **paid GPU Inference Endpoint**
  (https://ui.endpoints.huggingface.co) — then its URL + your `HF_TOKEN` are the
  "API key," and you'd add an HTTP provider to `chat.py`. That costs money per
  hour, so only do it if you specifically need a hosted API rather than Ollama.
- **Production note:** Render/Vercel can't reach an Ollama on your laptop. For a
  deployed model you'd run Ollama on a server (a small GPU/CPU VM) and set
  `OLLAMA_URL` to that host — or use the paid HF endpoint above.
