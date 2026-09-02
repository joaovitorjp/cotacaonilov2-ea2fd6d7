import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

const isoFromUnix = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function upsertAssinatura(row: Record<string, unknown>) {
  const { error } = await getSupabase()
    .from("assinaturas")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("Erro ao gravar assinatura:", error.message);
}

async function handleSubscription(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("Assinatura sem userId nos metadados");
    return;
  }
  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trial",
    past_due: "past_due",
    unpaid: "past_due",
    canceled: "canceled",
    incomplete: "pendente",
    incomplete_expired: "canceled",
    paused: "canceled",
  };

  await upsertAssinatura({
    user_id: userId,
    status: statusMap[subscription.status] ?? subscription.status,
    mp_preapproval_id: subscription.id,
    current_period_end: isoFromUnix(periodEnd),
  });
}

async function handleCheckoutCompleted(session: any) {
  const userId = session.metadata?.userId;
  if (!userId) return;
  if (session.payment_status === "unpaid") return;
  if (session.mode !== "payment") return;

  await upsertAssinatura({
    user_id: userId,
    status: "lifetime",
    mp_preapproval_id: session.id,
    current_period_end: null,
  });
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscription(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscription({ ...event.data.object, status: "canceled" });
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object);
      break;
    default:
      console.log("Evento não tratado:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("env inválido no webhook:", rawEnv);
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await handleWebhook(req, rawEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
