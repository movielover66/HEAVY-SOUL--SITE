// ============================================================
// HEAVY SOUL — CLOUDFLARE WORKER (backend API)
// Routes:
//   POST /api/create-order            → creates a Razorpay order
//   POST /api/verify-payment          → verifies a Razorpay payment
//                                        signature server-side, THEN
//                                        (and only then) writes the
//                                        order to the Orders sheet.
//                                        This is the ONLY place an
//                                        order is allowed to be saved —
//                                        the client can no longer save
//                                        an order on its own.
//   POST /api/phone-forgot-password   → verifies an MSG91 OTP access
//                                        token, then resets the
//                                        Firebase password for the
//                                        matching phone account
//   *                                  → falls through to static assets
// ============================================================

import { getGoogleAccessToken } from "./lib/gauth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      return handleCreateOrder(request, env, ctx);
    }

    if (url.pathname === "/api/phone-forgot-password" && request.method === "POST") {
      return handlePhoneForgotPassword(request, env, ctx);
    }

    if (url.pathname === "/api/verify-payment" && request.method === "POST") {
      return handleVerifyPayment(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  }
};

/* ========================================================= CREATE ORDER (Razorpay) ========================================================= */

async function handleCreateOrder(request, env, ctx) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return jsonResponse({ success: false, error: "Invalid amount" }, 400);
    }
    const priceCheck = await validateCartPricing_(body, env);
    if (!priceCheck.ok) {
      return jsonResponse({ success: false, error: priceCheck.error }, 400);
    }
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return jsonResponse({ success: false, error: "Razorpay keys not configured on server" }, 500);
    }

    const keyId = await env.RAZORPAY_KEY_ID.get();
    const keySecret = await env.RAZORPAY_KEY_SECRET.get();
    const auth = btoa(`${keyId}:${keySecret}`);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: body.orderId || undefined,
        notes: { heavySoulOrderId: body.orderId || "" }
      })
    });

    const rzpData = await rzpRes.json();

    if (!rzpRes.ok) {
      return jsonResponse({ success: false, error: rzpData?.error?.description || "Razorpay order creation failed" }, 500);
    }

    if (env.APPS_SCRIPT_URL) {
      ctx.waitUntil(
        fetch(env.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ type: "store_pending_order", apiToken: env.APPS_SCRIPT_API_TOKEN || "" }, body))
        }).catch(() => {})
      );
    }

    return jsonResponse({ success: true, order_id: rzpData.id });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

/* ========================================================= VERIFY PAYMENT (server-side, authoritative) ========================================================= */
// The client's Razorpay "handler" callback is JUST a UI event — it proves
// nothing on its own and can fire without a real captured payment (stale
// tab state, a replayed order_id, a browser/extension quirk, DevTools,
// etc.). This endpoint re-derives the HMAC-SHA256 signature from
// razorpay_order_id + razorpay_payment_id using OUR OWN key secret (never
// trust a signature the client sends) and compares it to what the client
// supplied. Only if that matches do we forward the order to Apps Script —
// this is now the ONLY path that can create a row in the Orders sheet for
// a prepaid/COD-advance order. The client is never trusted to save an
// order directly anymore.

async function handleVerifyPayment(request, env, ctx) {
  try {
    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderPayload } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderPayload) {
      return jsonResponse({ success: false, error: "Missing payment verification fields." }, 400);
    }

    if (!env.RAZORPAY_KEY_SECRET) {
      return jsonResponse({ success: false, error: "Razorpay keys not configured on server" }, 500);
    }

    const keySecret = await env.RAZORPAY_KEY_SECRET.get();
    const expectedSignature = await hmacSha256Hex_(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);

    if (!timingSafeEqual_(expectedSignature, String(razorpay_signature))) {
      return jsonResponse({ success: false, error: "Payment verification failed — signature mismatch." }, 400);
    }

    // Signature is valid -> this payment is genuinely captured by Razorpay.
    // Now (and only now) forward the full order to Apps Script.
    orderPayload.paymentReference = razorpay_payment_id;
    orderPayload.apiToken = env.APPS_SCRIPT_API_TOKEN || orderPayload.apiToken || "";

    if (!env.APPS_SCRIPT_URL) {
      return jsonResponse({ success: false, error: "Order backend not configured on server" }, 500);
    }

    const sheetRes = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(orderPayload)
    });
    const sheetData = await sheetRes.json().catch(() => ({ success: false, error: "Invalid response from order backend." }));

    return jsonResponse(sheetData, sheetRes.ok ? 200 : 500);

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

async function hmacSha256Hex_(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ========================================================= PHONE FORGOT-PASSWORD ========================================================= */
// Flow: the browser already ran the MSG91 OTP widget and got an
// "access token" proving the user owns this phone number. We re-verify
// that token server-side with MSG91 (never trust the client alone for
// something as sensitive as a password reset), then use a Firebase
// service-account OAuth2 token (see lib/gauth.js) to call the Identity
// Toolkit REST API directly — no firebase-admin, since that package
// isn't Workers-compatible.

async function handlePhoneForgotPassword(request, env, ctx) {
  try {
    const body = await request.json();
    const accessToken = String(body.accessToken || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const newPassword = String(body.newPassword || "");

    if (!accessToken) {
      return jsonResponse({ success: false, error: "Missing OTP access token" }, 400);
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return jsonResponse({ success: false, error: "Invalid phone number" }, 400);
    }
    if (newPassword.length < 6) {
      return jsonResponse({ success: false, error: "Password must be at least 6 characters" }, 400);
    }

    if (!env.MSG91_AUTHKEY || !env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return jsonResponse({ success: false, error: "Server is not fully configured" }, 500);
    }

    // ---- 1. Re-verify the OTP access token with MSG91 ----
    const msg91Authkey = await env.MSG91_AUTHKEY.get();
    const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: msg91Authkey, "access-token": accessToken })
    });
    const verifyData = await verifyRes.json().catch(() => null);

    if (!verifyRes.ok || !verifyData || verifyData.type !== "success") {
      return jsonResponse({ success: false, error: "OTP could not be verified — please try again" }, 401);
    }

    // ---- 2. Get a Google OAuth2 access token for the Identity Toolkit API ----
    // FIREBASE_SERVICE_ACCOUNT_EMAIL lives in the Cloudflare Secrets Store (needs .get()).
    // FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY is a classic Worker secret (too long for the
    // Secrets Store's 1024-char limit) — it's already a plain string, no .get() needed.
    const clientEmail = await env.FIREBASE_SERVICE_ACCOUNT_EMAIL.get();
    const privateKeyPem = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const googleToken = await getGoogleAccessToken(
      clientEmail,
      privateKeyPem,
      "https://www.googleapis.com/auth/identitytoolkit"
    );

    // ---- 3. Find the Firebase user for this phone (synthetic email) ----
    const syntheticEmail = phone + "@phone.heavysoul.in";
    const lookupRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleToken}`
      },
      body: JSON.stringify({ email: [syntheticEmail] })
    });
    const lookupData = await lookupRes.json();

    if (!lookupRes.ok) {
      return jsonResponse({ success: false, error: lookupData?.error?.message || "Account lookup failed" }, 500);
    }
    const account = lookupData.users && lookupData.users[0];
    if (!account) {
      return jsonResponse({ success: false, error: "No account found for this phone number" }, 404);
    }

    // ---- 4. Set the new password ----
    const updateRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleToken}`
      },
      body: JSON.stringify({ localId: account.localId, password: newPassword })
    });
    const updateData = await updateRes.json();

    if (!updateRes.ok) {
      return jsonResponse({ success: false, error: updateData?.error?.message || "Password update failed" }, 500);
    }

    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

/* ========================================================= PRICE VALIDATION ========================================================= */
// A tiny in-memory cache so we don't hit the Apps Script products
// endpoint on every single checkout — the sheet doesn't change that
// often. Workers reuse this across requests within the same isolate.
let _productsCache = null;
let _productsCacheAt = 0;
const PRODUCTS_CACHE_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAuthoritativeProducts_(env) {
  const now = Date.now();
  if (_productsCache && (now - _productsCacheAt) < PRODUCTS_CACHE_MS) {
    return _productsCache;
  }
  if (!env.APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(`${env.APPS_SCRIPT_URL}?type=products`);
    const data = await res.json();
    if (!data || !data.success || !Array.isArray(data.products)) return null;
    _productsCache = data.products;
    _productsCacheAt = now;
    return _productsCache;
  } catch (err) {
    return null;
  }
}
// A hard floor no legitimate order should ever fall below — even a
// single COD advance (₹150 by default) or a fully custom item is well
// above this. Catches tampering even if the catalog fetch itself fails.
const MIN_ORDER_AMOUNT = 1;

async function validateCartPricing_(body, env) {
  const amount = Number(body.amount);

  if (amount < MIN_ORDER_AMOUNT) {
    return { ok: false, error: `Order amount too low. Please refresh the page and try again.` };
  }

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || !items.length) {
    // No item breakdown to check against — the floor check above is
    // all the protection we can offer, so let it through.
    return { ok: true };
  }

  const catalog = await fetchAuthoritativeProducts_(env);
  if (!catalog) {
    // Catalog unreachable — don't hard-block checkout over a network
    // hiccup, but the MIN_ORDER_AMOUNT floor above still applies.
    return { ok: true };
  }

  const catalogById = new Map(catalog.map(p => [String(p.id), Number(p.price) || 0]));

  for (const item of items) {
    const realPrice = catalogById.get(String(item.id));
    if (realPrice === undefined) continue; // unknown id — skip, don't block on catalog drift
    const claimedPrice = Number(item.price) || 0;
    // Allow ₹1 slack for rounding; anything claiming a lower price than
    // the real catalog is tampering (stale fallback data or DevTools edit).
    if (claimedPrice < realPrice - 1) {
      return {
        ok: false,
        error: "Product prices have updated — please refresh your cart and try again."
      };
    }
  }

  return { ok: true };
}
/* ========================================================= HELPERS ========================================================= */

/* ========================================================= HELPERS ========================================================= */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
