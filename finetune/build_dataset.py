"""Build an instruction-tuning dataset for the FoodExpress menu assistant.

It produces chat-format JSONL (each line: {"messages": [system, user, assistant]})
teaching a small model the TWO things FoodExpress actually asks an LLM to do,
using the SAME prompt shapes the app sends — so the fine-tuned model drops
straight into the app's Ollama path:

  1. Recommend a dish from the menu (mirrors api/chat.py).
  2. Emit the exact order JSON the backend parses (mirrors api/chat.py
     AssistantOrderView): {"restaurant_id":int,"items":[{"menu_item":int,
     "quantity":int}],"reasoning":str}.

Menu source: the live API (FOODEXPRESS_API_URL) if reachable, else a bundled
snapshot so it runs anywhere (Colab, offline). Using the live API means the
generated order-JSON uses real menu_item IDs.

Run:  python build_dataset.py           # writes train.jsonl + val.jsonl
"""
import json
import os
import random
import urllib.request

random.seed(7)

API = os.environ.get("FOODEXPRESS_API_URL", "https://foodexpress-api-6cuf.onrender.com/api")

SYSTEM = (
    "You are the FoodExpress menu assistant. You help customers pick dishes and "
    "assemble orders. Be concise and only use dishes from the menu you are given."
)

# Bundled fallback (mirrors backend/seed.py) if the API is unreachable.
FALLBACK = [
    {"id": 1, "name": "Spice Route", "cuisine": "Indian", "menu_items": [
        {"id": 1, "name": "Butter Chicken", "price": "320.00", "is_vegetarian": False, "category": "Main", "description": "Creamy tomato gravy"},
        {"id": 2, "name": "Paneer Tikka", "price": "260.00", "is_vegetarian": True, "category": "Starter", "description": "Char-grilled cottage cheese"},
        {"id": 3, "name": "Garlic Naan", "price": "60.00", "is_vegetarian": True, "category": "Bread", "description": "Buttered flatbread"}]},
    {"id": 2, "name": "Sushi Zen", "cuisine": "Japanese", "menu_items": [
        {"id": 4, "name": "Salmon Nigiri", "price": "240.00", "is_vegetarian": False, "category": "Sushi", "description": "Two pieces, fresh salmon"},
        {"id": 5, "name": "Veg Maki Roll", "price": "200.00", "is_vegetarian": True, "category": "Sushi", "description": "Cucumber and avocado"},
        {"id": 6, "name": "Shoyu Ramen", "price": "330.00", "is_vegetarian": False, "category": "Main", "description": "Soy-based broth"}]},
    {"id": 3, "name": "Bella Italia", "cuisine": "Italian", "menu_items": [
        {"id": 7, "name": "Margherita Pizza", "price": "380.00", "is_vegetarian": True, "category": "Pizza", "description": "San Marzano, basil, mozzarella"},
        {"id": 8, "name": "Spaghetti Carbonara", "price": "420.00", "is_vegetarian": False, "category": "Pasta", "description": "Egg, pancetta, pecorino"},
        {"id": 9, "name": "Tiramisu", "price": "180.00", "is_vegetarian": True, "category": "Dessert", "description": "Classic coffee dessert"}]},
]


def fetch_menus():
    try:
        with urllib.request.urlopen(API + "/restaurants/", timeout=15) as r:
            restaurants = json.load(r)
        full = []
        for rest in restaurants:
            with urllib.request.urlopen(f"{API}/restaurants/{rest['id']}/", timeout=15) as r:
                full.append(json.load(r))
        if full:
            print(f"Using live menu from {API} ({len(full)} restaurants)")
            return full
    except Exception as e:
        print(f"API unreachable ({e}); using bundled snapshot")
    return FALLBACK


def menu_lines(rest):
    out = []
    for m in rest["menu_items"]:
        veg = "veg" if m["is_vegetarian"] else "non-veg"
        out.append(f"- {m['name']} ({m['category']}, {veg}, INR {m['price']})")
    return "\n".join(out)


def menu_json_for_order(restaurants):
    return json.dumps([
        {"restaurant_id": r["id"], "restaurant": r["name"], "cuisine": r.get("cuisine", ""),
         "items": [{"menu_item": m["id"], "name": m["name"], "price": m["price"],
                    "veg": m["is_vegetarian"]} for m in r["menu_items"]]}
        for r in restaurants
    ])


def ex(user, assistant):
    return {"messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
        {"role": "assistant", "content": assistant},
    ]}


def build(restaurants):
    rows = []
    order_menu = menu_json_for_order(restaurants)

    # --- Recommendation examples (mirror api/chat.py grounding) ---
    for r in restaurants:
        lines = menu_lines(r)
        for m in r["menu_items"]:
            veg = "vegetarian" if m["is_vegetarian"] else "non-vegetarian"
            questions = [
                f"What's a good {veg} option?",
                f"Suggest something from the {m['category'].lower()} section.",
                f"I'm craving {r['cuisine']} food, what should I get?",
                f"Something around INR {m['price']}?",
                f"What do you recommend here?",
            ]
            answer = (f"I'd go with the {m['name']} — {m['description'].lower()}. "
                      f"It's {veg}, INR {m['price']} from {r['name']}.")
            for q in questions:
                user = (f"Menu for {r['name']} ({r['cuisine']}):\n{lines}\n\n"
                        f"Customer asks: {q}\nAnswer in 1-2 sentences and name an exact dish.")
                rows.append(ex(user, answer))

    # --- Order-JSON examples (mirror AssistantOrderView) ---
    order_templates = [
        ("order me {desc}", 1), ("get me {desc}", 1), ("buy me {desc}", 1),
        ("I'd like to order {desc}", 1), ("order me {desc} for two", 2),
    ]
    for r in restaurants:
        veg_items = [m for m in r["menu_items"] if m["is_vegetarian"]]
        nonveg_items = [m for m in r["menu_items"] if not m["is_vegetarian"]]
        desc_pool = [
            ("a vegetarian meal", veg_items),
            (f"something {r['cuisine']}", r["menu_items"]),
            ("the cheapest dish", [min(r["menu_items"], key=lambda m: float(m["price"]))]),
            ("a hearty non-veg dish", nonveg_items or r["menu_items"]),
        ]
        for desc, pool in desc_pool:
            if not pool:
                continue
            for tmpl, qty in order_templates:
                pick = random.choice(pool)
                decision = {
                    "restaurant_id": r["id"],
                    "items": [{"menu_item": pick["id"], "quantity": qty}],
                    "reasoning": f"{pick['name']} from {r['name']} matches '{desc}'.",
                }
                user = (
                    "Assemble a FoodExpress order.\n"
                    f"Available restaurants and menus (JSON):\n{order_menu}\n\n"
                    f'Request: "{tmpl.format(desc=desc)}"\n'
                    'Respond with ONLY JSON: '
                    '{"restaurant_id":int,"items":[{"menu_item":int,"quantity":int}],"reasoning":str}'
                )
                rows.append(ex(user, json.dumps(decision)))

    random.shuffle(rows)
    return rows


def main():
    restaurants = fetch_menus()
    rows = build(restaurants)
    split = max(1, int(len(rows) * 0.1))
    val, train = rows[:split], rows[split:]
    with open("train.jsonl", "w", encoding="utf-8") as f:
        for r in train:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open("val.jsonl", "w", encoding="utf-8") as f:
        for r in val:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Wrote train.jsonl ({len(train)}) and val.jsonl ({len(val)})")


if __name__ == "__main__":
    main()
