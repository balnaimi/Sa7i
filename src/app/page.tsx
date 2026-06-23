"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Friendship, Profile, WakeSignal, WakeSignalText } from "@/lib/types";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

type View = "auth" | "home" | "settings" | "missed";
type ToastTone = "ok" | "warn" | "error";
type Toast = { tone: ToastTone; message: string } | null;
type WakeSoundId = "classic" | "soft" | "urgent" | "chime";
const EMOJI_REPLIES: WakeSignalText[] = ["✅", "❌"];
const WAKE_SOUND_STORAGE_KEY = "sa7i:wake-sound";
const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const WAKE_SOUND_OPTIONS: { id: WakeSoundId; label: string; description: string }[] = [
  { id: "classic", label: "التنبيه الأساسي", description: "ثلاث نغمات واضحة مثل الحالي." },
  { id: "soft", label: "هادئ", description: "نغمة خفيفة وأقل إزعاجاً." },
  { id: "urgent", label: "قوي", description: "تنبيه أسرع وأوضح إذا تبي شيء يلفت الانتباه." },
  { id: "chime", label: "جرس", description: "صوت جرس قصير بنغمة أعلى." },
];

function isEmojiReply(text: WakeSignalText) {
  return EMOJI_REPLIES.includes(text);
}

type FriendRow = {
  friendshipId: string;
  user: Profile;
  label: string;
};

type MissedSignal = WakeSignal & {
  sender?: Profile;
};

function formatSignalDate(value: string) {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function notificationTextForSignal(senderName: string, text: WakeSignalText) {
  if (isEmojiReply(text)) {
    return `${senderName}: وصلك رد سريع`;
  }
  return `${senderName}: ${text}`;
}

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@sa7i.local`;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function subscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  };
}

function buttonClass(variant: "primary" | "ghost" | "danger" = "primary") {
  const base =
    "rounded-2xl px-5 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
  if (variant === "ghost") {
    return `${base} border border-white/15 bg-white/10 text-white hover:bg-white/15`;
  }
  if (variant === "danger") {
    return `${base} bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400`;
  }
  return `${base} bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/25 hover:bg-emerald-300`;
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const configured = hasSupabaseConfig();
  const audioContextRef = useRef<AudioContext | null>(null);

  const [view, setView] = useState<View>("auth");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Friendship[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Friendship[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendRow | null>(null);
  const [latestIncoming, setLatestIncoming] = useState<WakeSignal | null>(null);
  const [missedSignals, setMissedSignals] = useState<MissedSignal[]>([]);
  const [pendingSignalCount, setPendingSignalCount] = useState(0);
  const [friendCode, setFriendCode] = useState("");
  const [friendLabel, setFriendLabel] = useState("");
  const [acceptLabels, setAcceptLabels] = useState<Record<string, string>>({});
  const [wakeSound, setWakeSound] = useState<WakeSoundId>(() => {
    if (typeof window === "undefined") return "classic";
    const savedSound = window.localStorage.getItem(WAKE_SOUND_STORAGE_KEY);
    return WAKE_SOUND_OPTIONS.some((option) => option.id === savedSound) ? (savedSound as WakeSoundId) : "classic";
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function notify(message: string, tone: ToastTone = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3800);
  }

  function playWakeSound(sound: WakeSoundId = wakeSound) {
    const AudioCtx = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const context = audioContextRef.current ?? new AudioCtx();
    audioContextRef.current = context;

    const patterns: Record<WakeSoundId, { offsets: number[]; frequencies: number[]; volume: number; duration: number; type: OscillatorType }> = {
      classic: { offsets: [0, 0.18, 0.36], frequencies: [660, 880, 660], volume: 0.24, duration: 0.16, type: "sine" },
      soft: { offsets: [0, 0.24], frequencies: [520, 620], volume: 0.14, duration: 0.22, type: "triangle" },
      urgent: { offsets: [0, 0.11, 0.22, 0.33], frequencies: [900, 740, 900, 740], volume: 0.28, duration: 0.1, type: "square" },
      chime: { offsets: [0, 0.16, 0.32], frequencies: [784, 988, 1319], volume: 0.2, duration: 0.24, type: "sine" },
    };

    const pattern = patterns[sound];
    const now = context.currentTime;
    pattern.offsets.forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = pattern.type;
      oscillator.frequency.setValueAtTime(pattern.frequencies[index] ?? pattern.frequencies[0], now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(pattern.volume, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + pattern.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + pattern.duration + 0.02);
    });
  }

  function changeWakeSound(sound: WakeSoundId) {
    setWakeSound(sound);
    window.localStorage.setItem(WAKE_SOUND_STORAGE_KEY, sound);
    playWakeSound(sound);
    notify("تم تغيير صوت التنبيه.");
  }

  async function showBrowserNotification(title: string, body: string) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        dir: "rtl",
      });
    }
  }

  async function enableSystemNotifications() {
    if (!profile) return;
    if (!PUBLIC_VAPID_KEY) {
      notify("أضف NEXT_PUBLIC_VAPID_PUBLIC_KEY في Vercel/.env أولاً.", "error");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      notify("هذا المتصفح ما يدعم تنبيهات النظام للـ PWA.", "error");
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        notify("لازم تسمح للتنبيهات من إعدادات المتصفح/النظام.", "error");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
      const keys = subscriptionKeys(subscription);
      if (!keys.p256dh || !keys.auth) throw new Error("تعذر قراءة مفاتيح الاشتراك.");

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          profile_id: profile.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" }
      );
      if (error) throw error;

      setPushEnabled(true);
      notify("تم تفعيل تنبيهات النظام لهذا الجهاز.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تفعيل تنبيهات النظام.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function testSystemNotifications() {
    if (!pushEnabled) {
      notify("فعّل تنبيهات النظام على هذا الجهاز أولاً.", "warn");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-signal-push", {
        body: { test: true },
      });
      if (error) throw error;
      const result = data as { attempted?: number; delivered?: number; failed?: number } | null;
      if (!result?.attempted) {
        notify("ما لقيت اشتراك محفوظ لهذا الجهاز. اضغط تفعيل التنبيهات مرة ثانية.", "error");
      } else if (!result.delivered) {
        notify(`وصل الطلب للـ Function لكن فشل إرسال Push. failed=${result.failed ?? "?"}`, "error");
      } else {
        notify("أرسلت تنبيه اختبار. إذا ما ظهر، راجع إعدادات تنبيهات Chrome/Android.");
      }
    } catch (error) {
      notify(error instanceof Error ? `فشل اختبار التنبيه: ${error.message}` : "فشل اختبار التنبيه.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function ensureProfile(userId: string, uname: string, name?: string) {
    const normalized = normalizeUsername(uname);
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: normalized,
          display_name: name?.trim() || normalized,
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error) throw error;
    setProfile(data);
    return data as Profile;
  }

  async function loadMissedSignals(userId: string) {
    const { data, error } = await supabase
      .from("wake_signals")
      .select("*, sender:profiles!wake_signals_sender_id_fkey(*)")
      .eq("receiver_id", userId)
      .is("seen_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      notify(error.message, "error");
      return [];
    }

    const signals = (data ?? []) as unknown as MissedSignal[];
    setMissedSignals(signals);
    setPendingSignalCount(signals.length);
    return signals;
  }

  async function loadEverything(userId: string) {
    const { data: myProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;
    setProfile(myProfile);

    const { data: friendships, error: friendsError } = await supabase
      .from("friendships")
      .select(
        "id, requester_id, addressee_id, requester_label, addressee_label, status, created_at, updated_at, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)"
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("updated_at", { ascending: false });

    if (friendsError) throw friendsError;

    const rows = (friendships ?? []) as unknown as Friendship[];
    setFriends(
      rows
        .filter((row) => row.status === "accepted")
        .map((row) => {
          const isRequester = row.requester_id === userId;
          const user = isRequester ? row.addressee! : row.requester!;
          const label = (isRequester ? row.requester_label : row.addressee_label) ||
            user.display_name ||
            user.username;

          return {
            friendshipId: row.id,
            user,
            label,
          };
        })
    );
    setIncomingRequests(
      rows.filter((row) => row.status === "pending" && row.addressee_id === userId)
    );
    setOutgoingRequests(
      rows.filter((row) => row.status === "pending" && row.requester_id === userId)
    );

    await loadMissedSignals(userId);
  }

  async function loadLatestIncoming(friendId: string) {
    if (!profile) return null;
    const { data, error } = await supabase
      .from("wake_signals")
      .select("*")
      .eq("sender_id", friendId)
      .eq("receiver_id", profile.id)
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      notify(error.message, "error");
      return null;
    }
    return data as WakeSignal | null;
  }

  async function chooseFriend(friend: FriendRow) {
    setSelectedFriend(friend);
    const incoming = await loadLatestIncoming(friend.user.id);
    setLatestIncoming(incoming);
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA enhancement فقط؛ التطبيق يشتغل حتى لو التسجيل فشل.
      });
    }
  }, []);

  useEffect(() => {
    if (!profile || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, [profile]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (!configured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      if (data.user) {
        try {
          await loadEverything(data.user.id);
          setView("home");
        } catch {
          await supabase.auth.signOut();
          setView("auth");
        }
      }
      setLoading(false);
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  // الصفحة تحتاج bootstrap مرة واحدة عند فتح التطبيق؛ loadEverything يقرأ الحالة الحالية من Supabase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`wake-signals-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wake_signals",
          filter: `receiver_id=eq.${profile.id}`,
        },
        async (payload) => {
          const signal = payload.new as WakeSignal;
          playWakeSound();
          const sender = friends.find((friend) => friend.user.id === signal.sender_id);
          const senderName = sender?.label || sender?.user.display_name || sender?.user.username || "صديقك";
          const notificationText = notificationTextForSignal(senderName, signal.text);
          notify(notificationText, "warn");
          await loadMissedSignals(profile.id);
          await showBrowserNotification("Sa7i", notificationText);
          if (selectedFriend?.user.id === signal.sender_id) {
            setLatestIncoming(signal);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // Realtime callback intentionally reads latest UI state and refreshes missed signals from Supabase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, profile, selectedFriend, supabase, wakeSound]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`friendships-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `requester_id=eq.${profile.id}`,
        },
        () => loadEverything(profile.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${profile.id}`,
        },
        () => loadEverything(profile.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // نعيد تحميل القوائم لما تصل/تتغير طلبات الصداقة للطرف الحالي.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, supabase]);

  useEffect(() => {
    if (!profile || !selectedFriend) return;

    let cancelled = false;

    async function refreshSelectedFriend() {
      const { data, error } = await supabase
        .from("wake_signals")
        .select("*")
        .eq("sender_id", selectedFriend!.user.id)
        .eq("receiver_id", profile!.id)
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && !error) {
        setLatestIncoming((data as WakeSignal | null) ?? null);
        await loadMissedSignals(profile!.id);
      }
    }

    const interval = window.setInterval(refreshSelectedFriend, 4000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSelectedFriend();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refreshSelectedFriend);
    void refreshSelectedFriend();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refreshSelectedFriend);
    };
  // Mobile browsers can pause websocket updates; poll/open-refresh keeps the friend button current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, selectedFriend, supabase]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      notify("أضف قيم Supabase في .env.local أو Vercel Environment Variables أولاً.", "error");
      return;
    }
    const normalized = normalizeUsername(username);

    if (!USERNAME_RE.test(normalized)) {
      notify("اسم المستخدم لازم يكون 3-24 حرف/رقم/شرطة سفلية.", "error");
      return;
    }
    if (password.length < 6) {
      notify("كلمة المرور لازم تكون 6 أحرف على الأقل.", "error");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: usernameToEmail(normalized),
          password,
          options: { data: { username: normalized } },
        });
        if (error) throw error;
        if (!data.user) throw new Error("لم يتم إنشاء المستخدم.");
        await ensureProfile(data.user.id, normalized, displayName);
        notify("تم إنشاء الحساب.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: usernameToEmail(normalized),
          password,
        });
        if (error) throw error;
        if (!data.user) throw new Error("تعذر تسجيل الدخول.");
        await loadEverything(data.user.id);
        notify("تم تسجيل الدخول.");
      }

      setView("home");
      setPassword("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "حدث خطأ غير معروف.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setFriends([]);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setSelectedFriend(null);
    setMissedSignals([]);
    setPendingSignalCount(0);
    setView("auth");
  }

  async function addFriend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    const targetCode = friendCode.trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    if (!/^[A-F0-9]{8}$/.test(targetCode)) {
      notify("اكتب كود إضافة صحيح من 8 خانات.", "error");
      return;
    }
    if (targetCode === profile.invite_code) {
      notify("ما تقدر تضيف نفسك.", "error");
      return;
    }

    setBusy(true);
    try {
      const { data: target, error: targetError } = await supabase
        .from("profiles")
        .select("*")
        .eq("invite_code", targetCode)
        .single();
      if (targetError) throw new Error("ما حصلت حساب بهذا الكود.");

      const label = friendLabel.trim() || (target as Profile).display_name || (target as Profile).username;
      const { error } = await supabase.from("friendships").insert({
        requester_id: profile.id,
        addressee_id: (target as Profile).id,
        requester_label: label,
      });
      if (error) throw error;

      setFriendCode("");
      setFriendLabel("");
      await loadEverything(profile.id);
      notify("تم إرسال طلب الإضافة.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر إرسال الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function acceptFriendship(friendship: Friendship) {
    if (!profile) return;
    const defaultLabel = friendship.requester?.display_name || friendship.requester?.username || "صديقي";
    const label = acceptLabels[friendship.id]?.trim() || defaultLabel;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", addressee_label: label })
        .eq("id", friendship.id);
      if (error) throw error;
      await loadEverything(profile.id);
      notify("قبلت طلب الإضافة.");
      setAcceptLabels((labels) => {
        const next = { ...labels };
        delete next[friendship.id];
        return next;
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر قبول الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rejectFriendship(friendship: Friendship) {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendship.id)
        .eq("addressee_id", profile.id)
        .eq("status", "pending");
      if (error) throw error;
      await loadEverything(profile.id);
      notify("رفضت طلب الإضافة.", "warn");
      setAcceptLabels((labels) => {
        const next = { ...labels };
        delete next[friendship.id];
        return next;
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر رفض الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendWakeSignal(text?: WakeSignalText) {
    if (!profile || !selectedFriend) return;
    setBusy(true);
    try {
      const isReply = Boolean(latestIncoming) && !isEmojiReply(latestIncoming!.text);
      const outgoingText = text ?? (isReply ? "صاحي.." : "صاحي ؟");
      const { data: sentSignal, error } = await supabase
        .from("wake_signals")
        .insert({
          sender_id: profile.id,
          receiver_id: selectedFriend.user.id,
          text: outgoingText,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { data: pushResult, error: pushError } = await supabase.functions.invoke("send-signal-push", {
        body: { signal_id: sentSignal.id },
      });

      if (latestIncoming) {
        await supabase
          .from("wake_signals")
          .update({ seen_at: new Date().toISOString() })
          .eq("id", latestIncoming.id);
        setLatestIncoming(null);
        await loadMissedSignals(profile.id);
      }

      if (pushError) {
        notify(`أرسلت: ${outgoingText}، لكن تنبيه النظام فشل: ${pushError.message}`, "warn");
      } else {
        const result = pushResult as { attempted?: number; delivered?: number; failed?: number } | null;
        if (!result?.attempted) {
          notify(`أرسلت: ${outgoingText}، لكن ما فيه جهاز مفعل تنبيهات عند الطرف الثاني.`, "warn");
        } else if (!result.delivered) {
          notify(`أرسلت: ${outgoingText}، لكن Push فشل. failed=${result.failed ?? "?"}`, "warn");
        } else {
          notify(`أرسلت: ${outgoingText}`);
        }
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر إرسال التنبيه.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function exitFriend() {
    if (profile && latestIncoming && isEmojiReply(latestIncoming.text)) {
      await supabase
        .from("wake_signals")
        .update({ seen_at: new Date().toISOString() })
        .eq("id", latestIncoming.id);
      await loadMissedSignals(profile.id);
    }
    setLatestIncoming(null);
    setSelectedFriend(null);
  }

  async function dismissIncoming() {
    if (!latestIncoming || !profile) return;
    await supabase
      .from("wake_signals")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", latestIncoming.id);
    setLatestIncoming(null);
    await loadMissedSignals(profile.id);
  }

  function friendForSignal(signal: MissedSignal) {
    return friends.find((friend) => friend.user.id === signal.sender_id) ?? null;
  }

  function senderNameForSignal(signal: MissedSignal) {
    const friend = friendForSignal(signal);
    return friend?.label || signal.sender?.display_name || signal.sender?.username || "صديقك";
  }

  async function openMissedSignal(signal: MissedSignal) {
    const friend = friendForSignal(signal);
    if (!friend) {
      notify("ما قدرت أفتح صفحة المرسل. حدّث الصفحة وحاول مرة ثانية.", "error");
      return;
    }
    await chooseFriend(friend);
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white" dir="rtl">
        <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 px-8 py-6">
          جار التحميل...
        </div>
      </main>
    );
  }

  if (selectedFriend) {
    const incomingEmoji = latestIncoming && isEmojiReply(latestIncoming.text);
    const buttonText = latestIncoming ? (incomingEmoji ? latestIncoming.text : "صاحي..") : "صاحي ؟";

    return (
      <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#134e4a_0%,#0f172a_42%,#020617_100%)] text-white" dir="rtl">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <button className={buttonClass("ghost")} onClick={() => void exitFriend()}>
              رجوع
            </button>
            <button className={buttonClass("ghost")} onClick={signOut}>
              خروج
            </button>
          </div>

          {toast ? (
            <div
              className={`fixed left-5 top-5 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm shadow-2xl backdrop-blur ${
                toast.tone === "error"
                  ? "border-rose-400/40 bg-rose-950/90 text-rose-50"
                  : toast.tone === "warn"
                    ? "border-amber-300/40 bg-amber-950/90 text-amber-50"
                    : "border-emerald-300/40 bg-emerald-950/90 text-emerald-50"
              }`}
            >
              {toast.message}
            </div>
          ) : null}

          <section className="grid flex-1 place-items-center py-8 text-center">
            <div>
              <p className="mb-3 text-white/60">@{selectedFriend.user.username}</p>
              <h1 className="mb-12 text-4xl font-black sm:text-6xl">{selectedFriend.label}</h1>

              <button
                className={`h-64 w-64 rounded-full text-5xl font-black shadow-[0_0_90px_rgba(52,211,153,0.45)] transition active:scale-95 disabled:opacity-80 sm:h-80 sm:w-80 sm:text-6xl ${
                  incomingEmoji
                    ? "bg-white text-slate-950"
                    : "bg-emerald-400 text-slate-950 hover:scale-105"
                }`}
                onClick={incomingEmoji ? dismissIncoming : () => sendWakeSignal()}
                disabled={busy}
                aria-label={incomingEmoji ? "تم استلام الرد" : "إرسال تنبيه"}
              >
                {buttonText}
              </button>

              {latestIncoming && !incomingEmoji ? (
                <div className="mt-8 flex justify-center gap-3">
                  <button
                    className="rounded-3xl bg-white px-8 py-5 text-4xl shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-60"
                    onClick={() => sendWakeSignal("✅")}
                    disabled={busy}
                    aria-label="OK"
                  >
                    ✅
                  </button>
                  <button
                    className="rounded-3xl bg-white px-8 py-5 text-4xl shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-60"
                    onClick={() => sendWakeSignal("❌")}
                    disabled={busy}
                    aria-label="Not OK"
                  >
                    ❌
                  </button>
                </div>
              ) : null}

              <p className="mx-auto mt-8 max-w-md text-sm leading-7 text-white/55">
                {incomingEmoji
                  ? "هذا رد سريع من صديقك. اضغط على الإيموجي لإخفائه."
                  : latestIncoming
                    ? "وصلك تنبيه من هذا الشخص. رد بزر صاحي.. أو رد سريع بإيموجي."
                    : "اضغط الزر، وبيوصل للطرف الثاني صوت وتنبيه داخل التطبيق."}
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#134e4a_0%,#0f172a_42%,#020617_100%)] text-white" dir="rtl">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-300">Sa7i / صاحي</p>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">زر واحد يكفي</h1>
          </div>
          {profile ? (
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass(view === "home" ? "primary" : "ghost")} onClick={() => setView("home")}>
                الأصدقاء
              </button>
              <button className={buttonClass(view === "missed" ? "primary" : "ghost")} onClick={() => setView("missed")}>
                تنبيهات فائتة {pendingSignalCount > 0 ? `(${pendingSignalCount})` : ""}
              </button>
              <button className={buttonClass(view === "settings" ? "primary" : "ghost")} onClick={() => setView("settings")}>
                الإعدادات
              </button>
              <button className={buttonClass("ghost")} onClick={signOut}>
                خروج
              </button>
            </div>
          ) : null}
        </header>

        {toast ? (
          <div
            className={`fixed left-5 top-5 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm shadow-2xl backdrop-blur ${
              toast.tone === "error"
                ? "border-rose-400/40 bg-rose-950/90 text-rose-50"
                : toast.tone === "warn"
                  ? "border-amber-300/40 bg-amber-950/90 text-amber-50"
                  : "border-emerald-300/40 bg-emerald-950/90 text-emerald-50"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        {view === "auth" ? (
          <section className="grid flex-1 place-items-center py-12">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
              <div className="mb-6 flex rounded-2xl bg-black/20 p-1">
                <button
                  className={`flex-1 rounded-xl py-3 font-bold ${mode === "login" ? "bg-white text-slate-950" : "text-white/70"}`}
                  onClick={() => setMode("login")}
                >
                  دخول
                </button>
                <button
                  className={`flex-1 rounded-xl py-3 font-bold ${mode === "signup" ? "bg-white text-slate-950" : "text-white/70"}`}
                  onClick={() => setMode("signup")}
                >
                  حساب جديد
                </button>
              </div>

              {!configured ? (
                <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-7 text-amber-100">
                  التطبيق مبني بنجاح، لكن يحتاج قيم Supabase في `.env.local` محلياً أو Environment Variables في Vercel قبل تسجيل الدخول.
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleAuth}>
                <label className="block">
                  <span className="mb-2 block text-sm text-white/70">اسم المستخدم</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="مثال: borashid"
                    autoComplete="username"
                  />
                </label>

                {mode === "signup" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm text-white/70">الاسم الظاهر اختياري</span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="مثال: بوراشد"
                    />
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-2 block text-sm text-white/70">كلمة المرور</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </label>

                <button className={`${buttonClass()} w-full`} disabled={busy}>
                  {busy ? "انتظر..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
                </button>
              </form>
            </div>
          </section>
        ) : null}

        {view === "home" ? (
          <section className="flex-1 py-8">
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur sm:p-8">
              <h2 className="mb-2 text-2xl font-black">الأصدقاء</h2>
              <p className="mb-6 text-white/60">اختر شخص، وبعدها بتفتح صفحة فيها زر واحد فقط.</p>
              {friends.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-white/15 bg-black/10 p-5 sm:p-8">
                  <div className="mb-6 text-center">
                    <h3 className="text-2xl font-black text-white">أول مرة؟ أضف صديقك</h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      انسخ كودك وأرسله له، أو اكتب كوده هنا وأرسل طلب الإضافة.
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                      <p className="text-xs text-white/60">كودك أنت</p>
                      <button
                        className="mt-2 w-full rounded-xl bg-slate-950/70 px-4 py-3 font-mono text-2xl font-black tracking-[0.35em] text-emerald-200"
                        onClick={async () => {
                          if (!profile?.invite_code) return;
                          await navigator.clipboard?.writeText(profile.invite_code);
                          notify("تم نسخ كود الإضافة.");
                        }}
                        title="اضغط لنسخ الكود"
                      >
                        {profile?.invite_code}
                      </button>
                      <p className="mt-2 text-xs leading-5 text-white/50">أرسل هذا الكود لصديقك عشان يضيفك.</p>
                    </div>

                    <form className="rounded-3xl border border-white/10 bg-white/10 p-4" onSubmit={addFriend}>
                      <p className="mb-3 text-sm font-black text-white">كود صديقك</p>
                      <input
                        className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-lg tracking-[0.25em] text-white outline-none ring-emerald-300/50 placeholder:font-sans placeholder:tracking-normal focus:ring-4"
                        value={friendCode}
                        onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
                        placeholder="مثال: A1B2C3D4"
                        inputMode="text"
                        maxLength={8}
                        dir="ltr"
                      />
                      <input
                        className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4"
                        value={friendLabel}
                        onChange={(event) => setFriendLabel(event.target.value)}
                        placeholder="الاسم اللي بيظهر عندك لهذا الشخص"
                        maxLength={40}
                      />
                      <button className={`${buttonClass()} w-full`} disabled={busy}>
                        إرسال طلب
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {friends.map((friend) => (
                    <button
                      key={friend.friendshipId}
                      className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-right transition hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-slate-900"
                      onClick={() => chooseFriend(friend)}
                    >
                      <p className="text-xl font-black">{friend.label}</p>
                      <p className="text-sm text-emerald-300">@{friend.user.username}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {view === "missed" ? (
          <section className="flex-1 py-8">
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black">تنبيهات فائتة</h2>
                <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">
                  {missedSignals.length}
                </span>
              </div>
              {missedSignals.length === 0 ? (
                <div className="grid min-h-[320px] place-items-center rounded-[2rem] border border-dashed border-white/15 bg-black/10 p-8 text-center text-white/55">
                  ما فيه تنبيهات فائتة حالياً.
                </div>
              ) : (
                <div className="space-y-3">
                  {missedSignals.map((signal) => (
                    <button
                      key={signal.id}
                      className="w-full rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-right transition hover:bg-amber-300/15"
                      onClick={() => openMissedSignal(signal)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black">{senderNameForSignal(signal)}</p>
                          <p className="text-xs text-white/50">{formatSignalDate(signal.created_at)}</p>
                        </div>
                        <span className="text-3xl">{signal.text}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="grid flex-1 gap-5 py-8 lg:grid-cols-2">
            <div className="space-y-5">
              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <p className="text-sm text-white/60">داخل باسم</p>
                <h2 className="text-2xl font-black">{profile?.display_name || profile?.username}</h2>
                <p className="text-sm text-emerald-300">@{profile?.username}</p>
                <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <p className="text-xs text-white/60">كود الإضافة الخاص فيك</p>
                  <button
                    className="mt-2 w-full rounded-xl bg-slate-950/70 px-4 py-3 font-mono text-2xl font-black tracking-[0.35em] text-emerald-200"
                    onClick={async () => {
                      if (!profile?.invite_code) return;
                      await navigator.clipboard?.writeText(profile.invite_code);
                      notify("تم نسخ كود الإضافة.");
                    }}
                    title="اضغط لنسخ الكود"
                  >
                    {profile?.invite_code}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-white/50">أرسل هذا الكود لصديقك عشان يضيفك.</p>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <h3 className="mb-2 text-lg font-black">تنبيهات النظام</h3>
                <p className="mb-4 text-sm leading-6 text-white/55">
                  فعلها عشان توصلك تنبيهات PWA من النظام حتى لو صفحة التطبيق مو مفتوحة.
                </p>
                <button className={`${buttonClass(pushEnabled ? "ghost" : "primary")} w-full`} onClick={enableSystemNotifications} disabled={busy}>
                  {pushEnabled ? "تنبيهات النظام مفعلة على هذا الجهاز" : "تفعيل تنبيهات النظام"}
                </button>
                <button
                  className={`${buttonClass("ghost")} mt-3 w-full`}
                  onClick={testSystemNotifications}
                  disabled={busy || !pushEnabled}
                  type="button"
                >
                  اختبار تنبيه النظام
                </button>
                {!PUBLIC_VAPID_KEY ? (
                  <p className="mt-3 text-xs leading-5 text-amber-200">
                    يحتاج إعداد VAPID في Vercel/Supabase قبل ما يشتغل على النسخة المنشورة.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <h3 className="mb-2 text-lg font-black">صوت التنبيه</h3>
                <p className="mb-4 text-sm leading-6 text-white/55">
                  اختر الصوت اللي تسمعه إذا وصلك تنبيه. الاختيار ينحفظ على هذا الجهاز.
                </p>
                <div className="space-y-2">
                  {WAKE_SOUND_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
                        wakeSound === option.id
                          ? "border-emerald-300/60 bg-emerald-300/15"
                          : "border-white/10 bg-black/20 hover:bg-black/30"
                      }`}
                    >
                      <input
                        className="mt-1 accent-emerald-300"
                        type="radio"
                        name="wake-sound"
                        checked={wakeSound === option.id}
                        onChange={() => changeWakeSound(option.id)}
                      />
                      <span>
                        <span className="block font-black">{option.label}</span>
                        <span className="block text-xs leading-5 text-white/55">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className={`${buttonClass("ghost")} mt-4 w-full`}
                  type="button"
                  onClick={() => playWakeSound()}
                >
                  تجربة الصوت
                </button>
              </div>

              <form className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur" onSubmit={addFriend}>
                <h3 className="mb-4 text-lg font-black">إضافة شخص بالكود</h3>
                <input
                  className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-lg tracking-[0.25em] text-white outline-none ring-emerald-300/50 placeholder:font-sans placeholder:tracking-normal focus:ring-4"
                  value={friendCode}
                  onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
                  placeholder="مثال: A1B2C3D4"
                  inputMode="text"
                  maxLength={8}
                  dir="ltr"
                />
                <input
                  className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4"
                  value={friendLabel}
                  onChange={(event) => setFriendLabel(event.target.value)}
                  placeholder="الاسم اللي بيظهر عندك لهذا الشخص"
                  maxLength={40}
                />
                <button className={`${buttonClass()} w-full`} disabled={busy}>
                  إرسال طلب
                </button>
              </form>
            </div>

            <div className="space-y-5">
              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <h3 className="mb-4 text-lg font-black">طلبات واردة</h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-sm text-white/50">ما فيه طلبات حالياً.</p>
                ) : (
                  <div className="space-y-3">
                    {incomingRequests.map((request) => (
                      <div key={request.id} className="rounded-2xl bg-black/20 p-3">
                        <p className="text-xs text-white/50">طلب من</p>
                        <p className="font-bold">
                          {request.requester?.display_name || request.requester?.username || "مستخدم"}
                        </p>
                        <p className="text-sm text-emerald-300">@{request.requester?.username}</p>
                        <input
                          className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-300/50 focus:ring-4"
                          value={acceptLabels[request.id] ?? ""}
                          onChange={(event) =>
                            setAcceptLabels((labels) => ({ ...labels, [request.id]: event.target.value }))
                          }
                          placeholder={`سمّه عندك: ${request.requester?.display_name || request.requester?.username || "صديقي"}`}
                          maxLength={40}
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            className={`${buttonClass()} py-2`}
                            onClick={() => acceptFriendship(request)}
                            disabled={busy}
                          >
                            قبول
                          </button>
                          <button
                            className={`${buttonClass("danger")} py-2`}
                            onClick={() => rejectFriendship(request)}
                            disabled={busy}
                          >
                            رفض
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <h3 className="mb-4 text-lg font-black">طلبات مرسلة</h3>
                {outgoingRequests.length === 0 ? (
                  <p className="text-sm text-white/50">ما فيه طلبات معلقة.</p>
                ) : (
                  <div className="space-y-2 text-sm text-white/70">
                    {outgoingRequests.map((request) => (
                      <p key={request.id}>بانتظار @{request.addressee?.username}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
