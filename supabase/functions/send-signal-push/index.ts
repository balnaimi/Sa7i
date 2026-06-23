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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notificationBody(senderName: string, text: string) {
  if (text === "✅" || text === "❌") return `${senderName}: وصلك رد سريع`;
  return `${senderName}: ${text}`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: "Missing Supabase or VAPID environment variables" }, 500);
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { signal_id } = await request.json().catch(() => ({ signal_id: null }));
  if (!signal_id || typeof signal_id !== "string") return jsonResponse({ error: "signal_id is required" }, 400);

  const { data: signal, error: signalError } = await adminClient
    .from("wake_signals")
    .select("id, sender_id, receiver_id, text")
    .eq("id", signal_id)
    .single<WakeSignal>();

  if (signalError || !signal) return jsonResponse({ error: "Signal not found" }, 404);
  if (signal.sender_id !== userData.user.id) return jsonResponse({ error: "Forbidden" }, 403);

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
  const payload = JSON.stringify({
    title: "Sa7i",
    body: notificationBody(senderName, signal.text),
    tag: `sa7i-${signal.sender_id}`,
    url: "/",
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

  return jsonResponse({ delivered: results.filter((result) => result.status === "fulfilled").length });
});
