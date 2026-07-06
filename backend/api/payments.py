"""Razorpay payment helpers.

Two modes, selected automatically so the project runs end-to-end whether or not
you have real keys yet:

  * REAL      — RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set. We create a real
                Razorpay order and verify the signature the checkout returns.
  * SIMULATED — no keys configured. We mint a fake `order_id` and accept a
                test-mode "simulate" confirmation. Lets the MCP server (and any
                headless client) complete a payment without a browser/card.

The simulate path is also always available when PAYMENTS_TEST_MODE=True, so the
MCP server can place-and-pay end-to-end even against real test keys (Razorpay
test cards otherwise require the interactive checkout widget).
"""
from decimal import Decimal

import razorpay
from decouple import config

RAZORPAY_KEY_ID = config("RAZORPAY_KEY_ID", default="")
RAZORPAY_KEY_SECRET = config("RAZORPAY_KEY_SECRET", default="")
# When true, the /simulate_payment/ endpoint is allowed (test/demo only).
PAYMENTS_TEST_MODE = config("PAYMENTS_TEST_MODE", default=True, cast=bool)

CURRENCY = "INR"


def keys_configured() -> bool:
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def to_paise(amount) -> int:
    """Razorpay works in the smallest currency unit (paise for INR)."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1")))


def create_order(amount, receipt: str) -> dict:
    """Create a payment order. Returns a dict with at least `id` and `amount`.

    Falls back to a simulated order when keys aren't configured so local dev and
    headless clients keep working.
    """
    paise = to_paise(amount)
    if keys_configured():
        order = _client().order.create(
            {"amount": paise, "currency": CURRENCY, "receipt": receipt}
        )
        return {"id": order["id"], "amount": paise, "simulated": False}
    # No keys → simulated order id the frontend/MCP can still round-trip.
    return {"id": f"order_sim_{receipt}", "amount": paise, "simulated": True}


def verify_signature(razorpay_order_id: str, razorpay_payment_id: str,
                     signature: str) -> bool:
    """Verify the checkout callback signature. Simulated orders bypass this."""
    if str(razorpay_order_id).startswith("order_sim_"):
        return True
    if not keys_configured():
        return False
    try:
        _client().utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
