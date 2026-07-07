# FoodExpress · Fine-tuning kit

Fine-tune a ~3B model (**Qwen2.5-3B-Instruct**, Apache-2.0) into the FoodExpress
menu assistant with **QLoRA/PyTorch**, push it to **your** Hugging Face, and run
it in the app via **Ollama**.

> **Why Ollama and not a HuggingFace API key?** A hosted API for a custom 3B model
> isn't free (HF serverless won't serve it; a GPU Inference Endpoint is paid).
> FoodExpress already supports Ollama, which is free and local. Details in
> `export_and_use_in_foodexpress.md`.

## Files
| File | What it does |
|------|--------------|
| `build_dataset.py` | Generates `train.jsonl`/`val.jsonl` from your menu — recommendation + order-JSON tasks, in the app's own prompt format. |
| `finetune_qlora.py` | QLoRA fine-tune (4-bit base + LoRA), optional merge + push to HF. |
| `finetune_colab.ipynb` | **Start here.** One-click Colab (free T4 GPU): installs, builds data, trains, pushes to HF, exports GGUF. |
| `Modelfile` | Turns the GGUF into an Ollama model (`ollama create`). |
| `requirements.txt` | Pinned, GPU/Linux deps (bitsandbytes has no Windows wheel). |
| `export_and_use_in_foodexpress.md` | GGUF → Ollama → wire into FoodExpress. |

## Fastest path (recommended)
1. Open `finetune_colab.ipynb` in Google Colab → `Runtime → T4 GPU`.
2. Run the cells top to bottom. Paste your HF write-token when asked; set `HF_REPO`
   to `your-username/foodexpress-qwen2.5-3b`.
3. Download the `.gguf`, then follow `export_and_use_in_foodexpress.md` to run it in
   Ollama and point FoodExpress at it.

## Run it yourself (own Linux GPU, ~16GB)
```bash
pip install -r requirements.txt
python build_dataset.py
python finetune_qlora.py --epochs 3 --merge --push --hf_repo you/foodexpress-qwen2.5-3b
```

## Honest expectations
This is a **learning/portfolio** exercise. Your prompted Gemini/Qwen already handles
the menu assistant well; a 3B fine-tune won't dramatically beat it. The value is the
ML pipeline itself — dataset synthesis, QLoRA, merging, GGUF export, and serving. If
you want measurable gains, expand `build_dataset.py` with many more, more varied
examples (that's where fine-tune quality actually comes from).
