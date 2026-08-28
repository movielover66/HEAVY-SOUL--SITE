# Heavy Soul — Backend Integrated Build

The frontend/site files are from the supplied `HEAVY-SOUL-site-buttons-fixed 2.zip`.

The supplied Apps Script backend files have been added under:

- `backend/apps-script/product.gs`
- `backend/apps-script/orders.gs`
- `backend/apps-script/shipping.gs`
- `backend/apps-script/razorpay-inventory.gs` (Razorpay order/webhook, pending orders, COD reconciliation, inventory)

The frontend already contains the Apps Script URL in `js/config.js`, product API loading,
admin API calls, Razorpay Worker integration, Firebase account/order handling, and tracking calls.

## Important deployment note

The supplied `orders.gs` and `shipping.gs` still reference additional functions marked in their
source comments as belonging to other backend parts (for example Telegram/WhatsApp notification
helpers, invoice helpers, and some tracking helpers). Those source parts were not included among
the files supplied so far, and have NOT been invented or silently replaced.

Before deploying the Apps Script backend, add the missing backend parts from the original
Heavy Soul Apps Script project/source.

## Required Script Properties mentioned by the supplied backend

See the comments at the top of the `.gs` files for the exact property names, including:

- ADMIN_PASSWORD
- API_SHARED_SECRET (if enabled)
- RAZORPAY_WEBHOOK_SECRET
- MSG91_AUTH_KEY
- ITHINK_ACCESS_TOKEN
- ITHINK_SECRET_KEY
- ITHINK_PICKUP_ADDRESS_ID
- ITHINK_RETURN_ADDRESS_ID
- ITHINK_LOGISTICS_PARTNER (optional)
- TRACKING_URL_BASE
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- R2_PUBLIC_URL

Do not put secret values into frontend files.


## Newly added backend part
`backend/apps-script/whatsapp-notifications.gs` contains the supplied Part 4:
WhatsApp click-to-chat builders, abandoned-cart and return-request handling,
daily/weekly summaries, and Telegram order alerts.

WhatsApp functionality creates pre-filled `wa.me` links; it does not send WhatsApp
messages automatically from Apps Script, as stated in the supplied source.
Required optional Telegram properties: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
