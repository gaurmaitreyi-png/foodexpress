import api from "../api/client";

/**
 * Razorpay checkout helper.
 *
 * Works in two modes so the app runs whether or not real keys are configured:
 *  - No keys yet  -> backend returns `simulated: true`; we call the test-mode
 *                    simulate endpoint to mark the order paid.
 *  - Real keys    -> we open the Razorpay checkout widget and, on success,
 *                    verify the signature server-side.
 */

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function payForOrder(
  orderId: number,
  prefill?: { name?: string; email?: string }
): Promise<any> {
  const { data } = await api.post(`/orders/${orderId}/create_payment/`);

  // No real gateway keys configured → complete via the test-mode simulate path.
  if (data.simulated || !data.key_id) {
    const res = await api.post(`/orders/${orderId}/simulate_payment/`);
    return res.data;
  }

  const ok = await loadRazorpayScript();
  if (!ok) throw new Error("Could not load Razorpay checkout.");

  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: data.key_id,
      amount: data.amount,
      currency: data.currency,
      name: "FoodExpress",
      description: `Order #${orderId}`,
      order_id: data.razorpay_order_id,
      prefill,
      theme: { color: "#1a1410" },
      handler: async (resp: any) => {
        try {
          const verify = await api.post(`/orders/${orderId}/verify_payment/`, {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          resolve(verify.data);
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.open();
  });
}
