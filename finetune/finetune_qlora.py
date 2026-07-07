"""QLoRA fine-tune of Qwen2.5-3B-Instruct on the FoodExpress dataset.

4-bit base + LoRA adapters so it trains on a single ~16GB GPU (Colab T4 works).
Produces a LoRA adapter, and optionally a merged fp16 model that can be pushed
to the Hugging Face Hub and/or exported to GGUF for Ollama.

Examples:
  python finetune_qlora.py                                   # train, save adapter
  python finetune_qlora.py --merge                           # + merged fp16 model
  python finetune_qlora.py --merge --push --hf_repo you/foodexpress-qwen2.5-3b
"""
import argparse
import os

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

DEFAULT_BASE = "Qwen/Qwen2.5-3B-Instruct"


def _to_text(ds, tokenizer):
    """Render each {"messages": [...]} example into a single training string
    using the model's chat template (Qwen uses ChatML)."""
    def fmt(ex):
        return {"text": tokenizer.apply_chat_template(ex["messages"], tokenize=False)}
    return ds.map(fmt, remove_columns=ds.column_names)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base_model", default=DEFAULT_BASE)
    ap.add_argument("--train", default="train.jsonl")
    ap.add_argument("--val", default="val.jsonl")
    ap.add_argument("--output_dir", default="foodexpress-qwen2.5-3b-lora")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--max_seq_len", type=int, default=1024)
    ap.add_argument("--merge", action="store_true", help="also save a merged fp16 model")
    ap.add_argument("--push", action="store_true", help="push the merged model to HF Hub")
    ap.add_argument("--hf_repo", default=os.environ.get("HF_REPO"),
                    help="target HF repo, e.g. yourname/foodexpress-qwen2.5-3b")
    args = ap.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    train_ds = _to_text(load_dataset("json", data_files=args.train, split="train"), tokenizer)
    val_ds = _to_text(load_dataset("json", data_files=args.val, split="train"), tokenizer)

    bnb = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model, quantization_config=bnb, device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    peft_config = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )

    sft = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch",
        bf16=True,
        max_seq_length=args.max_seq_len,
        dataset_text_field="text",
        packing=False,
        report_to="none",
    )

    # trl renamed `tokenizer` -> `processing_class`; support both.
    common = dict(model=model, args=sft, train_dataset=train_ds,
                  eval_dataset=val_ds, peft_config=peft_config)
    try:
        trainer = SFTTrainer(processing_class=tokenizer, **common)
    except TypeError:
        trainer = SFTTrainer(tokenizer=tokenizer, **common)

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print(f"\n✅ LoRA adapter saved to {args.output_dir}")

    if args.merge or args.push:
        from peft import AutoPeftModelForCausalLM
        merged_dir = args.output_dir + "-merged"
        merged = AutoPeftModelForCausalLM.from_pretrained(
            args.output_dir, torch_dtype=torch.bfloat16, device_map="auto",
        ).merge_and_unload()
        merged.save_pretrained(merged_dir)
        tokenizer.save_pretrained(merged_dir)
        print(f"✅ Merged fp16 model saved to {merged_dir}")

        if args.push:
            if not args.hf_repo:
                raise SystemExit("--push needs --hf_repo yourname/model (or HF_REPO env).")
            merged.push_to_hub(args.hf_repo)
            tokenizer.push_to_hub(args.hf_repo)
            print(f"✅ Pushed to https://huggingface.co/{args.hf_repo}")


if __name__ == "__main__":
    main()
