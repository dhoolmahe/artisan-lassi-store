const FLAVORS = {
  mango: { label: "Mango Lassi", unitAmount: 450 },
  orange: { label: "Orange Lassi", unitAmount: 430 },
};

const DELIVERY_MODES = {
  home_delivery: { label: "Home Delivery", charge: 150 },
  pickup: { label: "Come & Pickup", charge: 0 },
};

function respond(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function text(input) {
  return typeof input === "string" ? input.trim() : "";
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function buildFormBody(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => params.append(key, value));
  return params.toString();
}

async function insertPendingOrder(orderRecord) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing database configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(orderRecord),
  });

  const data = await response.json().catch(() => []);
  if (!response.ok) {
    const detail = data?.message || data?.error || "Database insert failed.";
    throw new Error(detail);
  }
  return data[0]?.id || null;
}

async function attachStripeSessionToOrder(orderId, stripeSessionId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!orderId || !supabaseUrl || !serviceRoleKey) return;

  const query = new URLSearchParams({ id: `eq.${orderId}` });
  await fetch(`${supabaseUrl}/rest/v1/orders?${query.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ stripe_session_id: stripeSessionId }),
  });
}

async function createStripeSession({
  flavor,
  quantity,
  deliveryMode,
  customerName,
  address,
  postcode,
  city,
  orderId,
  host,
}) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY in environment variables.");
  }

  const flavorDef = FLAVORS[flavor];
  const deliveryDef = DELIVERY_MODES[deliveryMode];

  const sessionPayload = {
    mode: "payment",
    success_url: `${host}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${host}/cancel.html`,
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": `${flavorDef.label} (350 ml)`,
    "line_items[0][price_data][unit_amount]": String(flavorDef.unitAmount),
    "line_items[0][quantity]": String(quantity),
    "metadata[order_id]": orderId || "not_saved",
    "metadata[flavor]": flavorDef.label,
    "metadata[delivery_mode]": deliveryDef.label,
    "metadata[quantity]": String(quantity),
    "metadata[customer_name]": customerName || "n/a",
    "metadata[address]": address || "n/a",
    "metadata[postcode]": postcode || "n/a",
    "metadata[city]": city || "n/a",
    submit_type: "pay",
  };

  if (deliveryDef.charge > 0) {
    sessionPayload["line_items[1][price_data][currency]"] = "eur";
    sessionPayload["line_items[1][price_data][product_data][name]"] =
      "Home Delivery Charge";
    sessionPayload["line_items[1][price_data][unit_amount]"] = String(
      deliveryDef.charge,
    );
    sessionPayload["line_items[1][quantity]"] = "1";
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: buildFormBody(sessionPayload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url || !data.id) {
    const detail = data?.error?.message || "Stripe checkout creation failed.";
    throw new Error(detail);
  }

  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return respond(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = parseBody(req);
    const flavor = text(body.flavor).toLowerCase();
    const deliveryMode = text(body.deliveryMode).toLowerCase();
    const quantity = Number.parseInt(body.quantity, 10);

    if (!FLAVORS[flavor]) {
      return respond(res, 400, { error: "Please select a valid lassi flavor." });
    }
    if (!DELIVERY_MODES[deliveryMode]) {
      return respond(res, 400, { error: "Please select a valid delivery mode." });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return respond(res, 400, { error: "Quantity must be between 1 and 20." });
    }

    const customerName = text(body.customerName);
    const address = text(body.address);
    const postcode = text(body.postcode);
    const city = text(body.city);

    if (deliveryMode === "home_delivery") {
      if (!customerName || !address || !postcode || !city) {
        return respond(res, 400, {
          error: "Name, address, post code, and city are required for home delivery.",
        });
      }
    }

    const flavorDef = FLAVORS[flavor];
    const deliveryDef = DELIVERY_MODES[deliveryMode];
    const totalAmount = flavorDef.unitAmount * quantity + deliveryDef.charge;

    const orderId = await insertPendingOrder({
      flavor,
      quantity,
      delivery_mode: deliveryMode,
      customer_name: customerName || null,
      address: address || null,
      postcode: postcode || null,
      city: city || null,
      amount_cents: totalAmount,
      status: "pending",
    });

    const host = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const checkout = await createStripeSession({
      flavor,
      quantity,
      deliveryMode,
      customerName,
      address,
      postcode,
      city,
      orderId,
      host,
    });

    await attachStripeSessionToOrder(orderId, checkout.id);
    return respond(res, 200, { url: checkout.url, sessionId: checkout.id, orderId });
  } catch (error) {
    return respond(res, 500, { error: error.message || "Unexpected server error." });
  }
};
