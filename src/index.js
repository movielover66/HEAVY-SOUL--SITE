// Main Worker entry point.
//
// Everything except /api/create-order is handled exactly like before —
// it just serves your site's static files (html/css/js/assets) via the
// ASSETS binding, so nothing about the site itself changes.
//
// /api/create-order does TWO things:
//   1. Creates the Razorpay order directly from Cloudflare's edge
//      (milliseconds) — this is what the checkout popup needs, and why
//      it now opens instantly instead of after a 5-second wait.
//   2. Tells Apps Script to save the full order details to the
//      "PendingOrders" sheet — this is REQUIRED, because when Razorpay
//      later confirms payment, its webhook asks Apps Script to look up
//      those saved details to actually create the order, book the
//      NimbusPost shipment, and generate the invoice.
//      This save happens via ctx.waitUntil(), so it runs in the
//      background AFTER the response is already sent.
//
// REQUIRED SETUP (do this once):
//   Cloudflare dashboard → Workers & Pages → heavy-soul-site →
//   Settings → Variables and Secrets → add:
//     RAZORPAY_KEY_ID     = rzp_live_TLJ04Y2T7hnl5m
//     RAZORPAY_KEY_SECRET = <your Razorpay Key Secret>   (mark as "Secret")

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      return handleCreateOrder(request, env, ctx);
    }

    // Everything else: serve the static site, unchanged.
    return env.ASSETS.fetch(request);
  }
};

async function handleCreateOrder(request, env, ctx) {
  try {
    const body = await request.json(); // full order payload: amount, orderId, customerName, phone, address, items, etc.
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return jsonResponse({ success: false, error: "Invalid amount" }, 400);
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return jsonResponse({ success: false, error: "Razorpay keys not configured on server" }, 500);
    }

    const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        receipt: body.orderId || undefined,
        notes: { heavySoulOrderId: body.orderId || "" }
      })
    });

    const rzpData = await rzpRes.json();

    if (!rzpRes.ok) {
      return jsonResponse({ success: false, error: rzpData?.error?.description || "Razorpay order creation failed" }, 500);
    }

    // Background save to Apps Script's PendingOrders sheet.
    if (env.APPS_SCRIPT_URL) {
      ctx.waitUntil(
        fetch(env.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ type: "store_pending_order" }, body))
        }).catch(() => {})
      );
    }

    return jsonResponse({ success: true, order_id: rzpData.id });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
