import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type WakeSignal = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function notificationBody(senderName: string, text: string) {
  if (text === "✅" || text === "❌") return `${senderName}: وصلك رد سريع`;
  return `${senderName}: ${text}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: "Missing Supabase or VAPID environment variables" }, 500);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return jsonResponse({ error: "Missing authorization token" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse({ error: "Unauthorized", details: userError?.message ?? "No user" }, 401);
  }

  const body = await request.json().catch(() => ({ signal_id: null, test: false }));
  const isTest = body.test === true;
  const signalId = body.signal_id;
  let signal: WakeSignal;

  if (isTest) {
    signal = {
      id: "test",
      sender_id: userData.user.id,
      receiver_id: userData.user.id,
      text: "اختبار تنبيه النظام",
    };
  } else {
    if (!signalId || typeof signalId !== "string") return jsonResponse({ error: "signal_id is required" }, 400);

    const { data, error: signalError } = await adminClient
      .from("wake_signals")
      .select("id, sender_id, receiver_id, text")
      .eq("id", signalId)
      .single<WakeSignal>();

    if (signalError || !data) return jsonResponse({ error: "Signal not found" }, 404);
    if (data.sender_id !== userData.user.id) return jsonResponse({ error: "Forbidden" }, 403);
    signal = data;
  }

  const { data: sender } = await adminClient
    .from("profiles")
    .select("display_name, username")
    .eq("id", signal.sender_id)
    .single<{ display_name: string | null; username: string }>();

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("profile_id", signal.receiver_id)
    .returns<PushSubscriptionRow[]>();

  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const senderName = sender?.display_name || sender?.username || "صديقك";
  const targetUrl = isTest ? "/" : `/?friend=${encodeURIComponent(signal.sender_id)}&signal=${encodeURIComponent(signal.id)}`;
  const payload = JSON.stringify({
    title: "Sa7i",
    body: notificationBody(senderName, signal.text),
    tag: `sa7i-${signal.sender_id}`,
    url: targetUrl,
  });

  const results = await Promise.allSettled(
    (subscriptions ?? []).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload
        );
        return { endpoint: subscription.endpoint, ok: true };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        }
        return { endpoint: subscription.endpoint, ok: false, statusCode };
      }
    })
  );

  const successCount = results.filter(
    (result) => result.status === "fulfilled" && result.value.ok
  ).length;
  const failureCount = results.length - successCount;

  return jsonResponse({
    ok: failureCount === 0,
    attempted: results.length,
    delivered: successCount,
    failed: failureCount,
    test: isTest,
  });
});
