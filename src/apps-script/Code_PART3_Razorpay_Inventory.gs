/**
 *  * HEAVY SOUL — Checkout Backend
  * PART 3 of 5 — Razorpay order creation + webhook handling, pending-order
   * storage, COD reconciliation, and inventory (stock decrement + low-stock
    * alerts).
     *
      * SETUP (one-time), Apps Script editor -> Project Settings -> Script Properties:
       *   RAZORPAY_KEY_ID          from Razorpay Dashboard -> Settings -> API Keys
        *   RAZORPAY_KEY_SECRET      same page
         *   RAZORPAY_WEBHOOK_SECRET  the secret you set when creating the webhook
          *                            in Razorpay Dashboard -> Settings -> Webhooks
           *                            (the webhook URL itself should be:
            *                            <APPS_SCRIPT_URL>?webhookSecret=<this value>)
             */

/* ========================================================= RAZORPAY ORDER CREATION ========================================================= */

function createRazorpayOrder_(amount, orderId) {
  var props = PropertiesService.getScriptProperties();
  var keyId = props.getProperty('RAZORPAY_KEY_ID');
  var keySecret = props.getProperty('RAZORPAY_KEY_SECRET');

  var url = 'https://api.razorpay.com/v1/orders';
  var payload = {
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt: orderId || ('receipt_' + new Date().getTime()),
    notes: { heavySoulOrderId: orderId || '' }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(keyId + ':' + keySecret) },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 200) {
      if (orderId) updatePendingOrderRazorpayId_(orderId, result.id);
      return { success: true, order_id: result.id, amount: result.amount };
    }
    logError_('Razorpay Order Creation Error: ' + response.getContentText());
    return { success: false, error: result.error ? result.error.description : 'Failed to create order' };
  } catch (err) {
    logError_('Razorpay fetch error: ' + err);
    return { success: false, error: 'Internal server error during order creation.' };
  }
}

/* ========================================================= PENDING ORDER STORAGE ========================================================= */
// Order details are parked here between "payment started" and "payment
// confirmed" (Razorpay webhook), so the full order can be recreated once
// the webhook fires — Razorpay's webhook payload alone doesn't carry your
// full checkout form data.

function storePendingOrder_(body) {
  var sheet = getOrCreateSheet_(PENDING_ORDERS_SHEET_NAME, PENDING_ORDERS_HEADERS);
  var orderId = String(body.orderId).trim();
  var existingRow = findPendingOrderRow_(sheet, orderId);
  var rowValues = [orderId, '', new Date(), JSON.stringify(body)];
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, PENDING_ORDERS_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  SpreadsheetApp.flush();
}

function updatePendingOrderRazorpayId_(orderId, razorpayOrderId) {
  var sheet = getOrCreateSheet_(PENDING_ORDERS_SHEET_NAME, PENDING_ORDERS_HEADERS);
  var rowIndex = findPendingOrderRow_(sheet, String(orderId).trim());
  if (rowIndex > 0) sheet.getRange(rowIndex, 2).setValue(razorpayOrderId);
}

function findPendingOrderRow_(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === orderId) return i + 2;
  }
  return -1;
}

function getPendingOrder_(orderId) {
  var sheet = getOrCreateSheet_(PENDING_ORDERS_SHEET_NAME, PENDING_ORDERS_HEADERS);
  var rowIndex = findPendingOrderRow_(sheet, orderId);
  if (rowIndex < 0) return null;
  var json = sheet.getRange(rowIndex, 4).getValue();
  try {
    return JSON.parse(json);
  } catch (e) {
    logError_('getPendingOrder_ JSON parse failed for ' + orderId + ': ' + e);
    return null;
  }
}

/* ========================================================= RAZORPAY WEBHOOK ========================================================= */

function handleRazorpayWebhook_(rawBody) {
  try {
    var payload = JSON.parse(rawBody);

    // Only react to 'order.paid' — fires once the full order amount is
    // captured (prepaid full payment, or the COD advance amount).
    if (payload.event !== 'order.paid') {
      return jsonResponse_({ success: true, ignored: true, event: payload.event || null });
    }

    var orderEntity = payload.payload && payload.payload.order && payload.payload.order.entity;
    var paymentEntity = payload.payload && payload.payload.payment && payload.payload.payment.entity;

    if (!orderEntity || !orderEntity.receipt) {
      logError_('Webhook order.paid: receipt missing. Raw: ' + rawBody);
      return jsonResponse_({ success: false, error: 'Missing receipt on order entity.' });
    }

    var heavySoulOrderId = orderEntity.receipt;
    var pendingBody = getPendingOrder_(heavySoulOrderId);

    if (!pendingBody) {
      logError_('Webhook: no pending order found for ' + heavySoulOrderId);
      return jsonResponse_({ success: false, error: 'No pending order found for ' + heavySoulOrderId });
    }

    if (paymentEntity && paymentEntity.id) pendingBody.paymentReference = paymentEntity.id;

    // handleOrder_ (PART 1) already skips duplicates, so it's safe even if
    // the client-side call already wrote this order.
    return handleOrder_(pendingBody);
  } catch (err) {
    logError_('handleRazorpayWebhook_ error: ' + err + (err.stack ? ' | ' + err.stack : ''));
    return jsonResponse_({ success: false, error: 'Internal webhook error.' });
  }
}

/* ========================================================= COD RECONCILIATION ========================================================= */

function updateCodReconciliationTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('COD Pending');
  if (existing) ss.deleteSheet(existing);
  var codSheet = ss.insertSheet('COD Pending');
  codSheet.getRange(1, 1, 1, 5).setValues([['Order ID', 'Customer Name', 'Phone', 'Amount', 'Order Date']]);
  codSheet.setFrozenRows(1);

  var ordersSheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var lastRow = ordersSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No orders yet.');
    return;
  }
  var data = ordersSheet.getRange(2, 1, lastRow - 1, ORDERS_HEADERS.length).getValues();
  var pending = [];
  for (var i = 0; i < data.length; i++) {
    var paymentType = data[i][10];
    var codCollected = data[i][8];
    if (paymentType === 'COD' && codCollected === false) {
      pending.push([data[i][0], data[i][3], data[i][4], data[i][9], data[i][7]]);
    }
  }
  if (pending.length > 0) codSheet.getRange(2, 1, pending.length, 5).setValues(pending);
  codSheet.autoResizeColumns(1, 5);
  Logger.log('COD Pending tab updated. ' + pending.length + ' order(s) pending collection.');
}

/* ========================================================= INVENTORY MANAGEMENT ========================================================= */

function decrementInventory_(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return;

  var sheet = getOrCreateSheet_(INVENTORY_SHEET_NAME, INVENTORY_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    logError_('Inventory sheet is empty — add your products first for auto stock tracking to work.');
    return;
  }

  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  items.forEach(function (item) {
    var itemName = String(item.name || '').trim().toLowerCase();
    var itemSize = String(item.size || '').trim().toLowerCase();
    var qty = Number(item.qty) || 1;
    var matched = false;

    for (var i = 0; i < data.length; i++) {
      var rowName = String(data[i][1] || '').trim().toLowerCase();
      var rowSize = String(data[i][2] || '').trim().toLowerCase();
      if (rowName === itemName && (rowSize === itemSize || (!rowSize && !itemSize))) {
        var rowIndex = i + 2;
        var currentStock = Number(data[i][3]) || 0;
        var threshold = Number(data[i][4]) || 0;
        var newStock = currentStock - qty;
        sheet.getRange(rowIndex, 4).setValue(newStock);
        matched = true;
        if (newStock < threshold) {
          try {
            sendLowStockAlert_(data[i][0], data[i][1], data[i][2], newStock, threshold);
          } catch (alertErr) {
            logError_('Low stock alert failed for ' + data[i][1] + ': ' + alertErr);
          }
        }
        break;
      }
    }

    if (!matched) {
      logError_('Inventory: no match found for "' + item.name + '" (' + item.size + ') — stock not decremented.');
    }
  });

  SpreadsheetApp.flush();
}

function sendLowStockAlert_(sku, productName, size, currentStock, threshold) {
  if (!SUMMARY_EMAIL_TO) return;
  var subject = '⚠️ Low Stock Alert — ' + productName + (size ? ' (' + size + ')' : '');
  var body = 'Heads up! Stock for ' + productName + (size ? ' size ' + size : '') +
    ' (SKU: ' + sku + ') has dropped to ' + currentStock + ', below your threshold of ' + threshold + '. Time to restock.';
  MailApp.sendEmail(SUMMARY_EMAIL_TO, subject, body);
}

function createInventoryTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(INVENTORY_SHEET_NAME);
  if (existing) {
    Logger.log('Inventory sheet already exists — leaving it as-is.');
    return;
  }
  var sheet = ss.insertSheet(INVENTORY_SHEET_NAME);
  sheet.getRange(1, 1, 1, INVENTORY_HEADERS.length).setValues([INVENTORY_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, 1, 6).setValues([['SKU-TEE-INK-M', 'Ink Oversized Tee', 'M', 20, 5, '=IF(D2<E2,"🔴 Low Stock","✅ OK")']]);
  sheet.getRange(2, 1, 1, 6).setFontColor('#888888').setFontStyle('italic');
  Logger.log('Inventory sheet created. Replace the example row with your real products.');
}