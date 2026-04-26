function respond(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
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

function text(input) {
  return typeof input === "string" ? input.trim() : "";
}

async function fetchStripeSession(sessionId) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY in environment variables.");
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || "Unable to fetch Stripe session.";
    throw new Error(detail);
  }
  return data;
}

async function markOrderPaid(sessionId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  const query = new URLSearchParams({ stripe_session_id: `eq.${sessionId}` });
  await fetch(`${supabaseUrl}/rest/v1/orders?${query.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      status: "paid",
      paid_at: new Date().toISOString(),
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return respond(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = parseBody(req);
    const sessionId = text(body.sessionId);
    if (!sessionId) {
      return respond(res, 400, { error: "Missing Stripe session id." });
    }

    const stripeSession = await fetchStripeSession(sessionId);
    const paid = stripeSession.payment_status === "paid";
    if (paid) {
      await markOrderPaid(sessionId);
    }

    return respond(res, 200, {
      sessionId,
      stripePaymentStatus: stripeSession.payment_status || "unknown",
      orderStatus: paid ? "paid" : "pending",
    });
  } catch (error) {
    return respond(res, 500, { error: error.message || "Unexpected server error." });
  }
};
