"""AI menu assistant.

Provider-aware so it works both locally and in the cloud:
  * Ollama  — a local LLM (http://localhost:11434), great for dev.
  * Gemini  — Google's hosted API, used in production where there is no local
              Ollama (Render/Vercel can't reach your machine's localhost).

Selection (CHAT_PROVIDER):
  * "ollama" or "gemini" forces a provider.
  * "auto" (default) picks Gemini when GEMINI_API_KEY is set, else Ollama.

Kept in its own module so the LLM/HTTP plumbing stays out of the core CRUD
views. Mirrors the project's class-based view style (see views.py) and reuses
the same JWT auth + DRF Response conventions as the rest of the API.
"""
import json
import re
from decimal import Decimal

import requests
from decouple import config
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import MenuItem, Order, Restaurant
from .serializers import MenuItemSerializer

# Ollama (local dev) — overridable via env, never hardcoded for deployment.
OLLAMA_URL = config("OLLAMA_URL", default="http://localhost:11434")
OLLAMA_MODEL = config("OLLAMA_MODEL", default="qwen2.5")

# Gemini (hosted, for production). Reuses the same GEMINI_API_KEY the MCP
# server already uses; same default model.
GEMINI_API_KEY = config("GEMINI_API_KEY", default="")
GEMINI_MODEL = config("GEMINI_MODEL", default="gemini-2.5-flash")

CHAT_PROVIDER = config("CHAT_PROVIDER", default="auto").lower()
LLM_TIMEOUT = config("LLM_TIMEOUT", default=30, cast=int)


def _provider():
    if CHAT_PROVIDER in ("gemini", "ollama"):
        return CHAT_PROVIDER
    return "gemini" if GEMINI_API_KEY else "ollama"


def _call_ollama(prompt):
    resp = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
        timeout=LLM_TIMEOUT,
    )
    resp.raise_for_status()
    return (resp.json().get("response") or "").strip()


def _call_gemini(prompt):
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        params={"key": GEMINI_API_KEY},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=LLM_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def _generate(prompt):
    return _call_gemini(prompt) if _provider() == "gemini" else _call_ollama(prompt)


def _format_menu(items):
    """One menu item per line, compact enough to keep the prompt fast."""
    lines = []
    for m in items:
        veg = "veg" if m.is_vegetarian else "non-veg"
        desc = f" — {m.description}" if m.description else ""
        lines.append(f"- {m.name} ({m.category}, {veg}, ₹{m.price}){desc}")
    return "\n".join(lines) if lines else "No items available right now."


def _format_orders(orders):
    if not orders:
        return "No previous orders."
    out = []
    for o in orders:
        names = ", ".join(i.menu_item.name for i in o.items.all())
        out.append(f"Order #{o.pk}: {names or 'n/a'}")
    return "\n".join(out)


def _match_dish(text, items):
    """Find a menu item whose exact name appears in the LLM reply.

    Prefers the longest matching name so e.g. "Paneer Butter Masala" wins over
    a stray "Paneer" substring.
    """
    if not text:
        return None
    low = text.lower()
    best = None
    for m in items:
        if m.name.lower() in low and (best is None or len(m.name) > len(best.name)):
            best = m
    return best


class ChatThrottle(ScopedRateThrottle):
    scope = "chat"


class ChatView(APIView):
    """POST /api/chat/ — ask the menu assistant a question.

    Body: { "question": str }
    The customer is taken from the JWT (request.user), not the body, matching
    how OrderViewSet scopes data to the authenticated user.
    """
    # Open to everyone so the menu assistant works before sign-in. The scoped
    # throttle (per-IP for anonymous users) keeps LLM usage in check.
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ChatThrottle]

    def post(self, request):
        question = (request.data.get("question") or "").strip()
        if not question:
            return Response(
                {"response": "Please type a question.", "success": False, "error": "empty_question"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Menu (for grounding) + this user's recent orders (for personalization).
        # Anonymous visitors simply get no order history in the prompt.
        items = list(MenuItem.objects.filter(is_available=True).select_related("restaurant"))
        recent_orders = (
            list(
                Order.objects.filter(customer=request.user)
                .prefetch_related("items__menu_item")[:5]
            )
            if request.user.is_authenticated
            else []
        )

        prompt = (
            "You are a helpful restaurant assistant for FoodExpress, a food delivery app. "
            "Here's our menu:\n"
            f"{_format_menu(items)}\n\n"
            "This customer previously ordered:\n"
            f"{_format_orders(recent_orders)}\n\n"
            f"They just asked: {question}\n\n"
            "Answer in 1-2 sentences, be friendly and helpful. "
            "If you can suggest a dish, include its exact name from the menu above."
        )

        try:
            answer = _generate(prompt)
        except requests.exceptions.RequestException:
            # Connection refused / timeout / bad status → treat as offline.
            return Response({
                "response": "Chat service is temporarily offline. Please try again later.",
                "success": False,
                "error": "llm_offline",
            })
        except Exception as e:  # pragma: no cover - defensive catch-all
            return Response({
                "response": "An error occurred. Please try again.",
                "success": False,
                "error": str(e),
            })

        dish = _match_dish(answer, items)
        return Response({
            "response": answer or "Sorry, I couldn't come up with an answer just now.",
            "suggested_dish_id": dish.id if dish else None,
            "suggested_dish": MenuItemSerializer(dish).data if dish else None,
            "success": True,
        })


def _strip_fences(text):
    t = (text or "").strip()
    t = re.sub(r"^```json\s*", "", t, flags=re.I)
    t = re.sub(r"^```\s*", "", t)
    t = re.sub(r"```$", "", t).strip()
    return t


def _menus_context():
    """All available restaurants + menus, compact JSON for the LLM to choose from."""
    out = []
    for r in Restaurant.objects.filter(is_open=True).prefetch_related("menu_items"):
        items = [
            {"menu_item": m.id, "name": m.name, "price": str(m.price),
             "veg": m.is_vegetarian, "category": m.category}
            for m in r.menu_items.all() if m.is_available
        ]
        if items:
            out.append({"restaurant_id": r.id, "restaurant": r.name,
                        "cuisine": r.cuisine, "items": items})
    return out


class AssistantOrderView(APIView):
    """POST /api/assistant/order/ — turn a natural-language request into a
    concrete, priced order *proposal* (it does NOT place the order; the client
    confirms, then places + pays via the normal /orders/ flow).

    Body: { "request": str, "delivery_address"?: str }
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ChatThrottle]

    def post(self, request):
        req = (request.data.get("request") or "").strip()
        if not req:
            return Response(
                {"success": False, "error": "empty_request",
                 "message": "Tell me what you'd like to order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        menus = _menus_context()
        if not menus:
            return Response({"success": False, "error": "no_menu",
                             "message": "No restaurants are open right now."})

        prompt = (
            "You assemble a food order for a FoodExpress customer.\n"
            f'User request: "{req}"\n\n'
            f"Available restaurants and menus (JSON):\n{json.dumps(menus)}\n\n"
            "Pick ONE restaurant and 1-4 menu items from it that best match the "
            "request. Respond with ONLY valid JSON, no markdown, exactly:\n"
            '{"restaurant_id": <int>, "items": [{"menu_item": <int>, "quantity": <int>}], '
            '"reasoning": "<one short sentence>"}'
        )

        try:
            decision = json.loads(_strip_fences(_generate(prompt)))
        except requests.exceptions.RequestException:
            return Response({"success": False, "error": "llm_offline",
                             "message": "Assistant is temporarily offline. Please try again."})
        except (ValueError, TypeError):
            return Response({"success": False, "error": "bad_plan",
                             "message": "Sorry, I couldn't put an order together. Try rephrasing."})

        rid = decision.get("restaurant_id")
        items_in = decision.get("items") or []
        by_id = {
            m.id: m for m in MenuItem.objects.filter(
                restaurant_id=rid, is_available=True,
                id__in=[i.get("menu_item") for i in items_in if isinstance(i, dict)],
            )
        }

        proposal_items, total = [], Decimal("0.00")
        for i in items_in:
            m = by_id.get(i.get("menu_item")) if isinstance(i, dict) else None
            if not m:
                continue
            try:
                qty = max(1, int(i.get("quantity", 1)))
            except (TypeError, ValueError):
                qty = 1
            line = m.price * qty
            total += line
            proposal_items.append({
                "menu_item": m.id, "name": m.name, "quantity": qty,
                "unit_price": str(m.price), "line_total": str(line),
            })

        if not proposal_items:
            return Response({"success": False, "error": "no_items",
                             "message": "I couldn't match any available dishes. Try rephrasing."})

        restaurant = Restaurant.objects.filter(id=rid).first()
        address = (
            (request.data.get("delivery_address") or "").strip()
            or getattr(request.user, "address", "") or ""
        )
        return Response({
            "success": True,
            "proposal": {
                "restaurant_id": rid,
                "restaurant_name": restaurant.name if restaurant else "",
                "items": proposal_items,
                "total": str(total),
                "reasoning": decision.get("reasoning", ""),
                "delivery_address": address,
            },
        })
