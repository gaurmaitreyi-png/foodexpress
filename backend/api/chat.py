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
import requests
from decouple import config
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import MenuItem, Order
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
