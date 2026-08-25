# Heavy Soul — Apps Script setup

1. Create or open the Google Apps Script project attached to the Heavy Soul Google Sheet.
2. Add the six `.gs` files in this folder as separate script files, preserving their contents.
3. In **Project Settings → Script properties**, set the values you use:
   - `ADMIN_PASSWORD`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   - `ITHINK_ACCESS_TOKEN`, `ITHINK_SECRET_KEY`, `ITHINK_PICKUP_ADDRESS_ID`
   - Optional: `ITHINK_RETURN_ADDRESS_ID`, `ITHINK_LOGISTICS_PARTNER`, `TRACKING_URL_BASE`, `API_SHARED_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
4. Deploy as a Web app. Copy its `/exec` URL into `js/config.js` as `APPS_SCRIPT_URL`.
5. In Razorpay, create an `order.paid` webhook pointing to:
   `<APPS_SCRIPT_URL>?webhookSecret=<RAZORPAY_WEBHOOK_SECRET>`
6. Run `installAllTriggers_` once from the Apps Script editor to create the tracking and email triggers.

Do not put private Razorpay, iThink, or Telegram keys in browser-side files.
