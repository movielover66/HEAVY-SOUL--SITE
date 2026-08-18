# HEAVY SOUL — New UI + Existing Backend Workflow

This build keeps the new UI and connects it to the existing HEAVY SOUL commerce stack.

## Runtime flow
1. Products load from Google Apps Script (`?type=products`) with local/fallback cache.
2. Cart uses `heavySoulCart` in localStorage and migrates the old `cart` key automatically.
3. Checkout validates customer/address information.
4. Prepaid creates a Razorpay order through `/api/create-order`, then opens Razorpay Checkout.
5. COD records the configured advance/handling logic and creates the order record.
6. Successful orders are posted to Apps Script, saved to Firestore for logged-in customers, and sent to the configured WhatsApp number.
7. Order confirmation reads the last order and shows real values.
8. Order tracking calls Apps Script `?type=track&order=...` and falls back to the latest local order.
9. Admin uses the proven `admin.html` + `js/admin.js` workflow from the existing site.

## Required deployment backend
- Keep the existing Cloudflare Worker route `/api/create-order` deployed.
- Keep the existing Google Apps Script `/exec` endpoint deployed.
- Keep the existing Firebase Auth + Firestore project.
- Keep the existing MSG91 configuration.
- Razorpay secret stays server-side; only the public Key ID is used in the browser.
