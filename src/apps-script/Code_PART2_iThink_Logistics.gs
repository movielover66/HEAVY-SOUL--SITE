/**
 *  * HEAVY SOUL — Checkout Backend
  * PART 2 of 5 — Shipping via iThink Logistics (replaces NimbusPost).
   * Shipment booking, AWB/label extraction, live tracking (single + batch),
    * status mapping, RTO/NDR detection, and the 30-minute auto-refresh trigger.
     *
      * SETUP (one-time), Apps Script editor -> Project Settings -> Script Properties:
       *   ITHINK_ACCESS_TOKEN      your iThink Logistics API access token
        *   ITHINK_SECRET_KEY        your iThink Logistics API secret key
         *   ITHINK_PICKUP_ADDRESS_ID the numeric Pickup Address ID from iThink's
          *                             dashboard (Settings -> Pickup Address -> Add).
           *   ITHINK_RETURN_ADDRESS_ID same idea, for the return address (often the
            *                             same as pickup — check your dashboard)
             *   ITHINK_LOGISTICS_PARTNER the courier iThink should book with for you,
              *                             e.g. "Delhivery" — check your iThink account
               *                             for which partners are enabled; leave blank
                *                             in Script Properties to let iThink auto-pick
                 *                             if your account supports that.
                  *   TRACKING_URL_BASE        public tracking page base URL, AWB gets appended
                   *
                    * NOTE: this is built directly from iThink Logistics' own Postman
                     * collection (api_v3), so field names should match exactly. access_token
                      * and secret_key go INSIDE "data" — see ithinkAuthenticatedRequest_.
                       */

var ITHINK_BASE_URL = 'https://api.ithinklogistics.com/api_v3';
var ITHINK_ADD_ORDER_BASE_URL = 'https://my.ithinklogistics.com/api_v3'; // order/add.json lives on a different host than the rest of the API
var MAX_RETRIES = 3;
var RETRY_BASE_DELAY_MS = 800;
var PACKAGE_LENGTH_CM = 2;
var PACKAGE_BREADTH_CM = 29.5;
var PACKAGE_HEIGHT_CM = 24.5;

/* ========================================================= SHIPMENT CREATION ========================================================= */

function createIthinkShipment_(order) {
  var props = PropertiesService.getScriptProperties();
  var pickupAddressId = props.getProperty('ITHINK_PICKUP_ADDRESS_ID');
  var returnAddressId = props.getProperty('ITHINK_RETURN_ADDRESS_ID') || pickupAddressId;
  var logisticsPartner = props.getProperty('ITHINK_LOGISTICS_PARTNER') || '';
  if (!pickupAddressId) throw new Error('Missing Script Property: ITHINK_PICKUP_ADDRESS_ID (register your warehouse on the iThink dashboard under Settings -> Pickup Address, then copy its ID here).');

  var isCod = String(order.paymentType).toLowerCase() === 'cod';
  var codAmount = (typeof order.codAmount === 'number' && order.codAmount > 0) ? order.codAmount : order.amount;
  var orderAmount = isCod ? codAmount : order.amount;
  var orderDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');
  var products = buildIthinkProducts_(order);

  var shipmentData = {
    waybill: '',
    order: String(order.orderId),
    sub_order: '',
    order_date: orderDate,
    total_amount: String(orderAmount),
    name: order.customerName,
    company_name: '',
    add: order.address,
    add2: '',
    add3: '',
    pin: String(order.pincode),
    city: order.city || order.state,
    state: order.state,
    country: 'India',
    phone: String(order.phone),
    alt_phone: '',
    email: order.email || '',
    is_billing_same_as_shipping: 'yes',
    products: products,
    shipment_length: String(PACKAGE_LENGTH_CM),
    shipment_width: String(PACKAGE_BREADTH_CM),
    shipment_height: String(PACKAGE_HEIGHT_CM),
    weight: String((order.weight || (products.length * 300)) / 1000), // grams -> kilograms, iThink expects kg
    shipping_charges: '0',
    giftwrap_charges: '0',
    transaction_charges: '0',
    total_discount: '0',
    first_attemp_discount: '0',
    cod_charges: '0',
    advance_amount: '0',
    cod_amount: isCod ? String(codAmount) : '0',
    payment_mode: isCod ? 'COD' : 'PREPAID',
    reseller_name: '',
    eway_bill_number: '',
    gst_number: '',
    return_address_id: returnAddressId
  };

  return ithinkAuthenticatedRequest_('/order/add.json', {
    shipments: [shipmentData],
    pickup_address_id: pickupAddressId,
    logistics: logisticsPartner,
    s_type: '',
    order_type: ''
  }, ITHINK_ADD_ORDER_BASE_URL);
}

function buildIthinkProducts_(order) {
  if (order.items && Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map(function (item) {
      var label = item.name + (item.size && item.size !== '-' ? ' (Size: ' + item.size + ')' : '');
      return {
        product_name: label,
        product_sku: item.sku || '',
        product_quantity: String(item.qty || 1),
        product_price: String(item.price || 0),
        product_tax_rate: '0',
        product_hsn_code: '',
        product_discount: '0'
      };
    });
  }
  return [{
    product_name: 'Heavy Soul Order ' + order.orderId,
    product_sku: order.orderId,
    product_quantity: '1',
    product_price: String(order.amount || 0),
    product_tax_rate: '0',
    product_hsn_code: '',
    product_discount: '0'
  }];
}

function extractAwb_(shipmentResult) {
  if (!shipmentResult) return null;
  var data = shipmentResult.data || shipmentResult;
  if (!data) return null;
  var list = (data.shipments && Array.isArray(data.shipments)) ? data.shipments : (Array.isArray(data) ? data : [data]);
  if (list[0]) {
    return list[0].waybill || list[0].awb_code || list[0].awb_number || list[0].awb || null;
  }
  return null;
}

function extractLabelUrl_(shipmentResult) {
  if (!shipmentResult) return null;
  var data = shipmentResult.data || shipmentResult;
  if (!data) return null;
  var list = (data.shipments && Array.isArray(data.shipments)) ? data.shipments : (Array.isArray(data) ? data : [data]);
  if (list[0]) {
    var first = list[0].label || list[0].label_url || list[0].shipping_label || null;
    return first ? String(first) : null;
  }
  return null;
}


/* ========================================================= TRACKING LOOKUP ========================================================= */

function lookupOrderStatus_(orderId) {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var rowIndex = findOrderRow_(sheet, orderId);
  if (rowIndex < 0) return { found: false };

  var refreshed = refreshTrackingForRow_(sheet, rowIndex);

  return {
    found: true,
    orderId: orderId,
    status: refreshed.status,
    customerName: refreshed.customerName,
    phone: refreshed.phone,
    address: refreshed.address,
    trackingLink: refreshed.awb ? buildTrackingLink_(refreshed.awb) : null,
    history: refreshed.history,
    estimatedDelivery: refreshed.estimatedDelivery,
    courierServiceName: refreshed.courierInfo ? refreshed.courierInfo.serviceName : null,
    riderName: refreshed.courierInfo ? refreshed.courierInfo.riderName : null,
    riderPhone: refreshed.courierInfo ? refreshed.courierInfo.riderPhone : null
  };
}

function refreshTrackingForRow_(sheet, rowIndex) {
  var rowData = sheet.getRange(rowIndex, 1, 1, ORDERS_HEADERS.length).getValues()[0];
  var status = rowData[1];
  var awb = rowData[2];
  var customerName = rowData[3];
  var phone = rowData[4];
  var address = rowData[5];
  var previousStatus = status;

  var history = [];
  var estimatedDelivery = null;
  var courierInfo = null;

  if (awb) {
    try {
      var trackingData = trackIthinkShipment_(awb);
      var rawStatus = extractTrackingStatus_(trackingData);
      var mappedStatus = mapIthinkStatus_(rawStatus);
      history = extractHistory_(trackingData);
      estimatedDelivery = extractEstimatedDelivery_(trackingData);
      courierInfo = extractCourierInfo_(trackingData);

      if (mappedStatus !== status) {
        sheet.getRange(rowIndex, 2).setValue(mappedStatus);
        status = mappedStatus;
      }

      var eddDate = parseEddToDate_(estimatedDelivery);
      if (eddDate) {
        sheet.getRange(rowIndex, 7).setValue(eddDate);
      } else if (estimatedDelivery) {
        sheet.getRange(rowIndex, 7).setValue(estimatedDelivery);
      }

      if (isRtoStatus_(rawStatus)) {
        sheet.getRange(rowIndex, 13).setValue('⚠️ RTO/Undelivered');
        var ndrReason = extractNdrReason_(trackingData, rawStatus);
        if (ndrReason) sheet.getRange(rowIndex, 18).setValue(ndrReason);
        try { sendDelayNdrWhatsappNotice_(rowData[0], phone, customerName, ndrReason); } catch (waErr) { logError_('NDR WhatsApp note failed: ' + waErr); }
      }

      // status changed to Delivered this refresh -> queue a review-request WhatsApp link
      if (mappedStatus === STATUS_DELIVERED && previousStatus !== STATUS_DELIVERED) {
        try { sendDeliveredReviewWhatsappNotice_(rowData[0], phone, customerName); } catch (waErr) { logError_('Delivered WhatsApp note failed: ' + waErr); }
      }

      SpreadsheetApp.flush();
    } catch (trackErr) {
      logError_('Live tracking refresh failed for AWB ' + awb + ' (order ' + rowData[0] + '): ' + trackErr);
    }
  }

  return {
    status: status, awb: awb, customerName: customerName, phone: phone, address: address,
    history: history, estimatedDelivery: estimatedDelivery, courierInfo: courierInfo
  };
}

function parseEddToDate_(eddString) {
  if (!eddString) return null;
  var parsed = new Date(eddString);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function extractNdrReason_(trackingData, rawStatus) {
  if (!trackingData) return rawStatus || null;
  var data = trackingData.data || trackingData;
  if (!data) return rawStatus || null;
  var reason = data.ndr_reason || data.reason || data.remark || null;
  if (!reason && data.history && Array.isArray(data.history) && data.history.length > 0) {
    var last = data.history[data.history.length - 1];
    reason = last.ndr_reason || last.reason || last.remark || null;
  }
  return reason ? String(reason) : (rawStatus || null);
}

function refreshAllTracking_() {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var awbColumn = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  var refreshedCount = 0;
  for (var i = 0; i < awbColumn.length; i++) {
    var awb = awbColumn[i][0];
    if (!awb) continue;
    var rowIndex = i + 2;
    try {
      refreshTrackingForRow_(sheet, rowIndex);
      refreshedCount++;
    } catch (err) {
      logError_('Batch refresh failed for row ' + rowIndex + ': ' + err);
    }
  }
  Logger.log('Batch tracking refresh complete. Rows refreshed: ' + refreshedCount);
}

function installTrackingRefreshTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'refreshAllTracking_') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('refreshAllTracking_').timeBased().everyMinutes(30).create();
  Logger.log('Installed: refreshAllTracking_ will now run automatically every 30 minutes.');
}

function extractCourierInfo_(trackingData) {
  if (!trackingData) return null;
  var data = trackingData.data || trackingData;
  if (!data) return null;
  var serviceName = data.courier_name || data.courier || data.carrier_name || null;
  var riderName = data.delivery_boy_name || data.rider_name || data.ofd_agent_name || data.delivery_agent_name || null;
  var riderPhone = data.delivery_boy_contact || data.delivery_boy_phone || data.rider_contact || data.rider_phone ||
    data.ofd_agent_contact || data.delivery_agent_contact || null;
  if ((!riderName || !riderPhone) && data.history && Array.isArray(data.history) && data.history.length > 0) {
    for (var i = data.history.length - 1; i >= 0; i--) {
      var entry = data.history[i];
      if (!riderName) riderName = entry.delivery_boy_name || entry.rider_name || entry.agent_name || riderName;
      if (!riderPhone) riderPhone = entry.delivery_boy_contact || entry.rider_contact || entry.agent_contact || riderPhone;
      if (riderName || riderPhone) break;
    }
  }
  if (!serviceName && !riderName && !riderPhone) return null;
  return {
    serviceName: serviceName ? String(serviceName) : null,
    riderName: riderName ? String(riderName) : null,
    riderPhone: riderPhone ? String(riderPhone) : null
  };
}

function extractHistory_(trackingData) {
  if (!trackingData) return [];
  var data = trackingData.data || trackingData;
  if (!data || !data.history || !Array.isArray(data.history)) return [];
  return data.history.map(function (entry) {
    var statusText = entry.status || entry.remark || entry.message || entry.activity || '';
    var location = entry.location || entry.city || entry.origin || entry.station || '';
    var time = entry.date || entry.timestamp || entry.time || entry.created_at || entry.scan_date || '';
    return { status: String(statusText), location: String(location), time: String(time) };
  }).filter(function (entry) { return entry.status; });
}

function extractEstimatedDelivery_(trackingData) {
  if (!trackingData) return null;
  var data = trackingData.data || trackingData;
  if (!data) return null;
  var edd = data.edd || data.expected_delivery_date || data.estimated_delivery || data.estimated_delivery_date || data.delivery_date || null;
  return edd ? String(edd) : null;
}

/* ========================================================= ITHINK LOGISTICS TRACKING ========================================================= */

function trackIthinkShipment_(awb) {
  if (!awb) throw new Error('AWB is required for tracking.');
  return ithinkAuthenticatedRequest_('/order/track.json', { awb_number_list: String(awb) });
}

function extractTrackingStatus_(trackingData) {
  if (!trackingData) return '';
  var data = trackingData.data || trackingData;
  if (!data) return '';
  // iThink often returns tracking keyed by AWB — unwrap if so.
  if (!Array.isArray(data) && typeof data === 'object') {
    var keys = Object.keys(data);
    if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') data = data[keys[0]];
  }
  if (data.status) return String(data.status);
  if (data.current_status) return String(data.current_status);
  if (data.history && Array.isArray(data.history) && data.history.length > 0) {
    var last = data.history[data.history.length - 1];
    return String(last.status || last.remark || last.message || '');
  }
  return '';
}

/* ========================================================= STATUS MAPPING ========================================================= */

function isRtoStatus_(rawStatus) {
  if (!rawStatus) return false;
  var s = String(rawStatus).toLowerCase();
  return s.indexOf('rto') !== -1 || s.indexOf('return to origin') !== -1 || s.indexOf('return to shipper') !== -1 ||
    s.indexOf('undelivered') !== -1 || s.indexOf('delivery failed') !== -1 || s.indexOf('ndr') !== -1;
}

function mapIthinkStatus_(ithinkStatus) {
  if (!ithinkStatus) return STATUS_CONFIRMED;
  var s = String(ithinkStatus).toLowerCase();
  if (s.indexOf('delivered') !== -1) return STATUS_DELIVERED;
  if (s.indexOf('out for delivery') !== -1 || s.indexOf('ofd') !== -1) return STATUS_OUT_FOR_DELIVERY;
  if (s.indexOf('in transit') !== -1 || s.indexOf('transit') !== -1 || s.indexOf('shipped') !== -1 ||
    s.indexOf('picked up') !== -1 || s.indexOf('pickup complete') !== -1 || s.indexOf('dispatched') !== -1 ||
    s.indexOf('reached') !== -1 || s.indexOf('departed') !== -1 || s.indexOf('arrived') !== -1) return STATUS_SHIPPED;
  if (s.indexOf('manifest') !== -1 || s.indexOf('packed') !== -1 || s.indexOf('ready to ship') !== -1 ||
    s.indexOf('pickup scheduled') !== -1 || s.indexOf('label') !== -1) return STATUS_PACKED;
  return STATUS_CONFIRMED;
}

/* ========================================================= TRACKING LINK ========================================================= */

function buildTrackingLink_(awb) {
  var base = PropertiesService.getScriptProperties().getProperty('TRACKING_URL_BASE');
  if (!base) return null;
  var separator = base.indexOf('?') !== -1 ? '&' : (base.charAt(base.length - 1) === '/' ? '' : '/');
  return base + separator + awb;
}

/* ========================================================= HTTP / NETWORKING HELPERS ========================================================= */

function ithinkAuthenticatedRequest_(path, dataFields, baseUrlOverride) {
  var props = PropertiesService.getScriptProperties();
  var accessToken = props.getProperty('ITHINK_ACCESS_TOKEN');
  var secretKey = props.getProperty('ITHINK_SECRET_KEY');
  if (!accessToken || !secretKey) throw new Error('ITHINK_ACCESS_TOKEN or ITHINK_SECRET_KEY missing from Script Properties.');

  // iThink expects access_token and secret_key INSIDE "data", alongside
  // whatever else the endpoint needs (shipments, awb_number_list, etc).
  var dataObj = { access_token: accessToken, secret_key: secretKey };
  for (var key in dataFields) if (dataFields.hasOwnProperty(key)) dataObj[key] = dataFields[key];

  var payload = { data: dataObj };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var base = baseUrlOverride || ITHINK_BASE_URL;
  var response = fetchWithRetry_(base + path, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();
  if (responseCode < 200 || responseCode >= 300) throw new Error('iThink Logistics API error on ' + path + '. HTTP ' + responseCode + ': ' + responseText);
  var parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (e) {
    throw new Error('iThink Logistics API returned invalid JSON on ' + path + ': ' + responseText);
  }
  return parsed;
}

function fetchWithRetry_(url, options) {
  var lastError = null;
  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      if (code >= 500 && attempt < MAX_RETRIES) {
        logError_('Attempt ' + attempt + ' got HTTP ' + code + ' from ' + url + '. Retrying.');
        Utilities.sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      logError_('Attempt ' + attempt + ' failed for ' + url + ': ' + err);
      if (attempt < MAX_RETRIES) Utilities.sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw new Error('Request to ' + url + ' failed after ' + MAX_RETRIES + ' attempts: ' + lastError);
}

/* ========================================================= MANUAL TEST HELPERS ========================================================= */

function testIthinkShipment() {
  var sampleOrder = {
    orderId: 'TESTRUN-' + new Date().getTime(),
    customerName: 'Test Customer', phone: '9999999999',
    address: 'Test Address Line 1', city: 'Kolkata', state: 'West Bengal', pincode: '700001',
    amount: 999, paymentType: 'prepaid', weight: 300,
    items: [{ name: 'Test Hoodie', size: 'L', qty: 1, price: 999 }]
  };
  try {
    var result = createIthinkShipment_(sampleOrder);
    Logger.log('SHIPMENT SUCCESS: ' + JSON.stringify(result));
  } catch (err) {
    Logger.log('SHIPMENT FAILED: ' + err);
  }
}