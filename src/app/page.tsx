"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type {
  Friendship,
  GroupJoinRequest,
  GroupMember,
  GroupResponse,
  GroupType,
  GroupVisibility,
  Profile,
  ShaltarteebGroup,
} from "@/lib/types";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

type View = "auth" | "home" | "friends" | "groups" | "notifications" | "settings";
type ToastTone = "ok" | "warn" | "error";
type Toast = { tone: ToastTone; message: string } | null;

type FriendRow = {
  friendshipId: string;
  user: Profile;
  label: string;
  isRequester: boolean;
};

type GroupMemberWithProfile = GroupMember & {
  profile?: Profile;
};

type GroupJoinRequestWithProfile = GroupJoinRequest & {
  requester?: Profile;
};

type GroupRow = ShaltarteebGroup & {
  members: GroupMemberWithProfile[];
  join_requests?: GroupJoinRequestWithProfile[];
};

type MapPoint = { lat: number; lng: number };

const DEFAULT_MAP_POINT: MapPoint = { lat: 25.2854, lng: 51.5310 };

function openStreetMapUrl(point: MapPoint) {
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`;
}

function miniMapUrl(point: MapPoint) {
  const offset = 0.006;
  const bbox = [point.lng - offset, point.lat - offset, point.lng + offset, point.lat + offset].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${point.lat},${point.lng}`;
}

function usernameToEmail(username: string) {
  // لا نغير دومين الإيميل الداخلي للحسابات القديمة؛ Supabase auth مبني عليه.
  return `${username.toLowerCase()}@sa7i.local`;
}

function fallbackUsernameToEmail(username: string) {
  return `${username.toLowerCase()}@shaltarteeb.local`;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function buttonClass(variant: "primary" | "ghost" | "danger" | "sky" = "primary") {
  const base =
    "rounded-2xl px-5 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
  if (variant === "ghost") return `${base} border border-white/15 bg-white/10 text-white hover:bg-white/15`;
  if (variant === "danger") return `${base} bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400`;
  if (variant === "sky") return `${base} bg-sky-300 text-slate-950 shadow-lg shadow-sky-300/25 hover:bg-sky-200`;
  return `${base} bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/25 hover:bg-emerald-300`;
}

function cardClass(extra = "") {
  return `rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur sm:p-6 ${extra}`;
}

function formatMoney(value?: number | null) {
  const number = Number(value ?? 0);
  return `${number.toLocaleString("ar-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.ق`;
}

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ToastBanner({ toast }: { toast: Toast }) {
  if (!toast) return null;
  const toneClass =
    toast.tone === "error"
      ? "border-rose-400/40 bg-rose-950/90 text-rose-50"
      : toast.tone === "warn"
        ? "border-amber-300/40 bg-amber-950/90 text-amber-50"
        : "border-emerald-300/40 bg-emerald-950/90 text-emerald-50";

  return <div className={`fixed left-5 top-5 z-50 max-w-sm rounded-2xl border px-5 py-4 text-sm shadow-2xl backdrop-blur ${toneClass}`}>{toast.message}</div>;
}

function MapPickerModal({ initialPoint, onCancel, onPick }: { initialPoint: MapPoint | null; onCancel: () => void; onPick: (point: MapPoint) => void }) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [draft, setDraft] = useState<MapPoint>(initialPoint ?? DEFAULT_MAP_POINT);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    async function initMap() {
      if (!mapNode.current || mapRef.current) return;
      const L = await import("leaflet");
      if (!mounted || !mapNode.current) return;
      const map = L.map(mapNode.current, { zoomControl: true }).setView([draft.lat, draft.lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([draft.lat, draft.lng], {
        draggable: true,
        icon: L.divIcon({ className: "", html: '<div style="font-size:30px;line-height:30px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))">📍</div>', iconSize: [30, 30], iconAnchor: [15, 30] }),
      }).addTo(map);

      const updatePoint = (lat: number, lng: number) => {
        const point = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
        setDraft(point);
        marker.setLatLng([point.lat, point.lng]);
      };

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        updatePoint(position.lat, position.lng);
      });
      map.on("click", (event: { latlng: { lat: number; lng: number } }) => updatePoint(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      markerRef.current = marker;
      cleanup = () => map.remove();
      setTimeout(() => map.invalidateSize(), 100);
    }

    void initMap();
    return () => {
      mounted = false;
      cleanup?.();
      mapRef.current = null;
      markerRef.current = null;
    };
  // Initialize Leaflet once for this modal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const point = { lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) };
      setDraft(point);
      const map = mapRef.current as { setView: (coords: [number, number], zoom: number) => void } | null;
      const marker = markerRef.current as { setLatLng: (coords: [number, number]) => void } | null;
      map?.setView([point.lat, point.lng], 16);
      marker?.setLatLng([point.lat, point.lng]);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur" dir="rtl">
      <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950 p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-black text-white">حدد المكان على الخريطة</h3>
            <p className="text-sm text-white/55">اضغط على الخريطة أو اسحب العلامة للمكان المطلوب.</p>
          </div>
          <button className={buttonClass("ghost")} type="button" onClick={useCurrentLocation}>موقعي الحالي</button>
        </div>
        <div ref={mapNode} className="h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900" />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-white/55" dir="ltr">{draft.lat}, {draft.lng}</p>
          <div className="flex gap-2">
            <button className={buttonClass("ghost")} type="button" onClick={onCancel}>إلغاء</button>
            <button className={buttonClass("primary")} type="button" onClick={() => onPick(draft)}>اختيار المكان</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const configured = hasSupabaseConfig();

  const [view, setView] = useState<View>("auth");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Friendship[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null);
  const [publicGroup, setPublicGroup] = useState<GroupRow | null>(null);
  const [publicGroupBlocked, setPublicGroupBlocked] = useState(false);
  const [friendCode, setFriendCode] = useState("");
  const [friendLabel, setFriendLabel] = useState("");
  const [acceptLabels, setAcceptLabels] = useState<Record<string, string>>({});
  const [friendLabelEdits, setFriendLabelEdits] = useState<Record<string, string>>({});
  const [memberLabelEdits, setMemberLabelEdits] = useState<Record<string, string>>({});
  const [memberNoteEdits, setMemberNoteEdits] = useState<Record<string, string>>({});
  const [memberDueEdits, setMemberDueEdits] = useState<Record<string, string>>({});
  const [memberPaidEdits, setMemberPaidEdits] = useState<Record<string, string>>({});
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [selectedGroupFriendIds, setSelectedGroupFriendIds] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupType, setNewGroupType] = useState<GroupType>("arrangement");
  const [newGroupDate, setNewGroupDate] = useState("");
  const [newGroupTime, setNewGroupTime] = useState("");
  const [newGroupLocation, setNewGroupLocation] = useState("");
  const [newGroupLocationPoint, setNewGroupLocationPoint] = useState<MapPoint | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [newGroupLocationUrl, setNewGroupLocationUrl] = useState("");
  const [newGroupVisibility, setNewGroupVisibility] = useState<GroupVisibility>("private");
  const [allowJoinRequests, setAllowJoinRequests] = useState(true);
  const [newTotalAmount, setNewTotalAmount] = useState("");
  const [autoSplitAmount, setAutoSplitAmount] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const groupParam = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("group");
  const activeGroups = groups.filter((group) => acceptedMember(group, profile?.id));
  const groupInvitations = groups.filter((group) => invitedMember(group, profile?.id));
  const pendingJoinRequests = groups.flatMap((group) =>
    group.created_by === profile?.id ? (group.join_requests ?? []).filter((request) => request.status === "pending").map((request) => ({ ...request, group })) : []
  );
  const notificationCount = incomingRequests.length + groupInvitations.length + pendingJoinRequests.length;

  function notify(message: string, tone: ToastTone = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3800);
  }

  function acceptedMember(group: GroupRow, profileId?: string | null) {
    if (!profileId) return null;
    return group.members.find((member) => member.profile_id === profileId && member.membership_status === "accepted") ?? null;
  }

  function invitedMember(group: GroupRow, profileId?: string | null) {
    if (!profileId) return null;
    return group.members.find((member) => member.profile_id === profileId && member.membership_status === "invited") ?? null;
  }

  function memberName(member: GroupMemberWithProfile, group?: GroupRow | null) {
    if (member.display_label) return member.display_label;
    if (member.profile_id === profile?.id) return profile.display_name || profile.username || "أنت";
    return friendLabelForProfile(member.profile_id) || member.profile?.display_name || member.profile?.username || (group?.created_by === member.profile_id ? "الأدمن" : "عضو");
  }

  function friendLabelForProfile(profileId: string) {
    return friends.find((friend) => friend.user.id === profileId)?.label;
  }

  function groupMembers(group: GroupRow) {
    return [...(group.members ?? [])]
      .filter((member) => member.membership_status === "accepted")
      .sort((a, b) => memberName(a, group).localeCompare(memberName(b, group), "ar"));
  }

  function groupTotals(group: GroupRow) {
    const members = groupMembers(group);
    const due = members.reduce((sum, member) => sum + Number(member.amount_due ?? 0), 0);
    const paid = members.reduce((sum, member) => sum + Number(member.amount_paid ?? 0), 0);
    return { due, paid, remaining: Math.max(0, due - paid) };
  }

  function shareUrl(group: GroupRow) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${window.location.pathname}?group=${group.id}`;
  }

  async function ensureProfile(userId: string, uname: string, name?: string) {
    const normalized = normalizeUsername(uname);
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, username: normalized, display_name: name?.trim() || normalized }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    setProfile(data as Profile);
    return data as Profile;
  }

  async function loadFriendships(userId: string) {
    const { data, error } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, requester_label, addressee_label, status, created_at, updated_at, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as unknown as Friendship[];
    const acceptedFriends = rows
      .filter((row) => row.status === "accepted")
      .map((row) => {
        const isRequester = row.requester_id === userId;
        const user = isRequester ? row.addressee! : row.requester!;
        return {
          friendshipId: row.id,
          user,
          label: (isRequester ? row.requester_label : row.addressee_label) || user.display_name || user.username,
          isRequester,
        };
      });

    setFriends(acceptedFriends);
    setIncomingRequests(rows.filter((row) => row.status === "pending" && row.addressee_id === userId));
    setOutgoingRequests(rows.filter((row) => row.status === "pending" && row.requester_id === userId));
    return acceptedFriends;
  }

  async function loadGroups(userId: string) {
    const { data, error } = await supabase
      .from("groups")
      .select("*, members:group_members(*, profile:profiles!group_members_profile_id_fkey(*)), join_requests:group_join_requests(*, requester:profiles!group_join_requests_requester_id_fkey(*))")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const loaded = ((data ?? []) as unknown as GroupRow[]).map((group) => ({
      ...group,
      members: group.members ?? [],
      join_requests: group.join_requests ?? [],
    }));
    setGroups(loaded);
    setSelectedGroup((current) => loaded.find((group) => group.id === current?.id) ?? loaded.find((group) => acceptedMember(group, userId)) ?? null);
    return loaded;
  }

  async function loadEverything(userId: string) {
    const { data: myProfile, error: profileError } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (profileError) throw profileError;
    setProfile(myProfile as Profile);
    await loadFriendships(userId);
    return loadGroups(userId);
  }

  async function loadPublicGroup(groupId: string) {
    const { data, error } = await supabase
      .from("groups")
      .select("*, members:group_members(*)")
      .eq("id", groupId)
      .maybeSingle();

    if (error || !data) {
      setPublicGroup(null);
      setPublicGroupBlocked(true);
      return;
    }
    const group = data as unknown as GroupRow;
    setPublicGroup({ ...group, members: group.members ?? [] });
    setPublicGroupBlocked(false);
  }

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      if (!configured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        if (groupParam) await loadPublicGroup(groupParam);
        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;
        if (error) throw error;
        if (data.user) {
          await loadEverything(data.user.id);
          setView(groupParam ? "groups" : "home");
        }
      } catch {
        if (mounted) setView("auth");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void bootstrap();
    return () => { mounted = false; };
  // bootstrap once per initial URL/client.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`shaltarteeb-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `requester_id=eq.${profile.id}` }, () => void loadEverything(profile.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `addressee_id=eq.${profile.id}` }, () => void loadEverything(profile.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => void loadGroups(profile.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => void loadGroups(profile.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests" }, () => void loadGroups(profile.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // Realtime refreshes authenticated lists.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, supabase]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return notify("أضف قيم Supabase في .env.local أو Vercel Environment Variables أولاً.", "error");
    const normalized = normalizeUsername(username);
    if (!USERNAME_RE.test(normalized)) return notify("اسم المستخدم لازم يكون 3-24 حرف/رقم/شرطة سفلية.", "error");
    if (password.length < 6) return notify("كلمة المرور لازم تكون 6 أحرف على الأقل.", "error");

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: usernameToEmail(normalized),
          password,
          options: { data: { username: normalized, display_name: displayName.trim() || normalized } },
        });
        if (error) throw error;
        if (!data.user) throw new Error("لم يتم إنشاء المستخدم.");
        await ensureProfile(data.user.id, normalized, displayName);
      } else {
        let data;
        let error;
        const primary = await supabase.auth.signInWithPassword({ email: usernameToEmail(normalized), password });
        data = primary.data;
        error = primary.error;
        if (error) {
          const fallback = await supabase.auth.signInWithPassword({ email: fallbackUsernameToEmail(normalized), password });
          data = fallback.data;
          error = fallback.error;
        }
        if (error) throw error;
        if (!data.user) throw new Error("تعذر تسجيل الدخول.");
        await loadEverything(data.user.id);
      }
      setPassword("");
      setView("home");
      notify(mode === "login" ? "تم تسجيل الدخول." : "تم إنشاء الحساب.");
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
    setGroups([]);
    setSelectedGroup(null);
    setView("auth");
  }

  async function addFriend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const targetCode = friendCode.trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    if (!/^[A-F0-9]{8}$/.test(targetCode)) return notify("اكتب كود إضافة صحيح من 8 خانات.", "error");
    if (targetCode === profile.invite_code) return notify("ما تقدر تضيف نفسك.", "error");
    setBusy(true);
    try {
      const { data: target, error: targetError } = await supabase.from("profiles").select("*").eq("invite_code", targetCode).single();
      if (targetError) throw new Error("ما حصلت حساب بهذا الكود.");
      const targetProfile = target as Profile;
      const { error } = await supabase.from("friendships").insert({ requester_id: profile.id, addressee_id: targetProfile.id, requester_label: friendLabel.trim() || targetProfile.display_name || targetProfile.username });
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
    setBusy(true);
    try {
      const { error } = await supabase.from("friendships").update({ status: "accepted", addressee_label: acceptLabels[friendship.id]?.trim() || defaultLabel }).eq("id", friendship.id);
      if (error) throw error;
      await loadEverything(profile.id);
      notify("قبلت طلب الإضافة.");
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
      const { error } = await supabase.from("friendships").delete().eq("id", friendship.id).eq("addressee_id", profile.id).eq("status", "pending");
      if (error) throw error;
      await loadEverything(profile.id);
      notify("رفضت طلب الإضافة.", "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر رفض الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveFriendLabel(friend: FriendRow) {
    if (!profile) return;
    const label = (friendLabelEdits[friend.friendshipId] ?? friend.label).trim() || friend.user.display_name || friend.user.username;
    const labelColumn = friend.isRequester ? "requester_label" : "addressee_label";
    const ownerColumn = friend.isRequester ? "requester_id" : "addressee_id";
    setBusy(true);
    try {
      const { error } = await supabase.from("friendships").update({ [labelColumn]: label }).eq("id", friend.friendshipId).eq(ownerColumn, profile.id).eq("status", "accepted");
      if (error) throw error;
      await loadEverything(profile.id);
      notify("تم تحديث اسم الصديق عندك.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تحديث الاسم.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFriend(friend: FriendRow) {
    if (!profile || !window.confirm(`حذف ${friend.label} من قائمة الأصدقاء؟`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("friendships").delete().eq("id", friend.friendshipId).eq("status", "accepted");
      if (error) throw error;
      await loadEverything(profile.id);
      notify("تم حذف الصديق.", "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حذف الصديق.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleGroupFriend(friendId: string) {
    setSelectedGroupFriendIds((ids) => ids.includes(friendId) ? ids.filter((id) => id !== friendId) : [...ids, friendId]);
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const name = newGroupName.trim();
    if (!name) return notify("اكتب اسم القروب أولاً.", "error");
    const totalAmount = toNumber(newTotalAmount);
    if (newGroupType === "qutiyyah" && newTotalAmount.trim() && totalAmount === null) return notify("اكتب مبلغ صحيح أو اتركه فاضي.", "error");

    setBusy(true);
    try {
      const groupId = crypto.randomUUID();
      const memberIds = [profile.id, ...selectedGroupFriendIds];
      const splitAmount = newGroupType === "qutiyyah" && autoSplitAmount && totalAmount ? Number((totalAmount / memberIds.length).toFixed(2)) : null;
      const { error: groupError } = await supabase.from("groups").insert({
        id: groupId,
        created_by: profile.id,
        name,
        description: newGroupDescription.trim() || null,
        group_type: newGroupType,
        event_date: newGroupDate || null,
        event_time: newGroupTime || null,
        location_name: newGroupLocation.trim() || null,
        location_url: newGroupLocationPoint ? openStreetMapUrl(newGroupLocationPoint) : newGroupLocationUrl.trim() || null,
        location_lat: newGroupLocationPoint?.lat ?? null,
        location_lng: newGroupLocationPoint?.lng ?? null,
        visibility: newGroupVisibility,
        allow_join_requests: newGroupVisibility === "public" ? allowJoinRequests : false,
        total_amount: newGroupType === "qutiyyah" ? totalAmount : null,
        auto_split_amount: newGroupType === "qutiyyah" ? autoSplitAmount : false,
      });
      if (groupError) throw groupError;

      const rows = memberIds.map((profileId) => {
        const friend = friends.find((row) => row.user.id === profileId);
        return {
          group_id: groupId,
          profile_id: profileId,
          added_by: profile.id,
          membership_status: profileId === profile.id ? "accepted" : "invited",
          display_label: profileId === profile.id ? profile.display_name || profile.username : friend?.label ?? null,
          amount_due: splitAmount,
          amount_paid: 0,
          is_money_manager: profileId === profile.id && newGroupType === "qutiyyah",
        };
      });
      const { error: membersError } = await supabase.from("group_members").insert(rows);
      if (membersError) throw membersError;

      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupDate("");
      setNewGroupTime("");
      setNewGroupLocation("");
      setNewGroupLocationPoint(null);
      setNewGroupLocationUrl("");
      setNewTotalAmount("");
      setSelectedGroupFriendIds([]);
      const loaded = await loadGroups(profile.id);
      setSelectedGroup(loaded.find((group) => group.id === groupId) ?? null);
      setView("groups");
      notify("تم إنشاء القروب.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر إنشاء القروب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateGroupResponse(group: GroupRow, member: GroupMemberWithProfile, response: GroupResponse) {
    if (!profile) return;
    const isCreator = group.created_by === profile.id;
    if (!isCreator && member.profile_id !== profile.id) return notify("تقدر تعدل مربعك فقط.", "error");
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").update({ response, responded_at: response ? new Date().toISOString() : null }).eq("id", member.id);
      if (error) throw error;
      await loadGroups(profile.id);
      notify(response === "yes" ? "تم اختيار صح." : response === "no" ? "تم اختيار لا." : "رجعت الحالة بدون قرار.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تحديث الحالة.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveMemberDetails(group: GroupRow, member: GroupMemberWithProfile) {
    if (!profile) return;
    const isCreator = group.created_by === profile.id;
    const myMember = acceptedMember(group, profile.id);
    const isMoneyManager = Boolean(myMember?.is_money_manager);
    const canEditMoney = isCreator || isMoneyManager;
    const canEditLabel = isCreator;
    const canEditNote = isCreator || member.profile_id === profile.id;
    const update: Partial<GroupMember> = {};

    if (canEditLabel) update.display_label = (memberLabelEdits[member.id] ?? memberName(member, group)).trim() || null;
    if (canEditNote) update.note = (memberNoteEdits[member.id] ?? member.note ?? "").trim() || null;
    if (group.group_type === "qutiyyah" && canEditMoney) {
      update.amount_due = toNumber(memberDueEdits[member.id] ?? String(member.amount_due ?? ""));
      update.amount_paid = toNumber(memberPaidEdits[member.id] ?? String(member.amount_paid ?? ""));
    }
    if (Object.keys(update).length === 0) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").update(update).eq("id", member.id);
      if (error) throw error;
      await loadGroups(profile.id);
      notify("تم الحفظ.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر الحفظ.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMoneyManager(group: GroupRow, member: GroupMemberWithProfile) {
    if (!profile || group.created_by !== profile.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").update({ is_money_manager: !member.is_money_manager }).eq("id", member.id);
      if (error) throw error;
      await loadGroups(profile.id);
      notify(!member.is_money_manager ? "تم تعيين مسؤول قطيّة." : "تم إلغاء مسؤول القطيّة.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تحديث الصلاحية.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function inviteFriendToGroup(group: GroupRow, friend: FriendRow) {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").insert({ group_id: group.id, profile_id: friend.user.id, added_by: profile.id, membership_status: "invited", display_label: friend.label, amount_due: 0, amount_paid: 0 });
      if (error) throw error;
      await loadGroups(profile.id);
      notify("تم إرسال دعوة القروب.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر إرسال الدعوة.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function acceptGroupInvite(group: GroupRow) {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").update({ membership_status: "accepted" }).eq("group_id", group.id).eq("profile_id", profile.id).eq("membership_status", "invited");
      if (error) throw error;
      const loaded = await loadGroups(profile.id);
      setSelectedGroup(loaded.find((row) => row.id === group.id) ?? null);
      setView("groups");
      notify("قبلت دعوة القروب.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر قبول الدعوة.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rejectGroupInvite(group: GroupRow) {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").delete().eq("group_id", group.id).eq("profile_id", profile.id).eq("membership_status", "invited");
      if (error) throw error;
      await loadGroups(profile.id);
      notify("رفضت دعوة القروب.", "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر رفض الدعوة.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeGroupMember(group: GroupRow, member: GroupMemberWithProfile) {
    if (!profile) return;
    const isSelf = member.profile_id === profile.id;
    if (group.created_by === profile.id && isSelf) return notify("منشئ القروب ما يطلع نفسه حالياً. إذا تبي تشيل القروب كامل استخدم حذف القروب.", "warn");
    if (!window.confirm(isSelf ? `الخروج من ${group.name}؟` : `إزالة ${memberName(member, group)} من ${group.name}؟`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("group_members").delete().eq("id", member.id);
      if (error) throw error;
      const loaded = await loadGroups(profile.id);
      setSelectedGroup(isSelf ? null : loaded.find((row) => row.id === group.id) ?? null);
      notify(isSelf ? "طلعت من القروب." : "تمت إزالة العضو.", "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر تحديث العضوية.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(group: GroupRow) {
    if (!profile || group.created_by !== profile.id) return;
    const confirmed = window.confirm(`حذف القروب "${group.name}" بالكامل؟ هذا بيحذف الأعضاء والطلبات وكل بيانات القروب.`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("groups").delete().eq("id", group.id).eq("created_by", profile.id);
      if (error) throw error;
      const loaded = await loadGroups(profile.id);
      setSelectedGroup(loaded.find((row) => acceptedMember(row, profile.id)) ?? null);
      notify("تم حذف القروب.", "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حذف القروب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink(group: GroupRow) {
    await navigator.clipboard?.writeText(shareUrl(group));
    notify("تم نسخ رابط القروب.");
  }

  async function requestJoin(group: GroupRow) {
    if (!profile) return notify("سجل دخول أول عشان تطلب الانضمام.", "warn");
    setBusy(true);
    try {
      const { error } = await supabase.from("group_join_requests").insert({ group_id: group.id, requester_id: profile.id });
      if (error) throw error;
      notify("تم إرسال طلب الانضمام للأدمن.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر إرسال الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function decideJoinRequest(request: GroupJoinRequestWithProfile & { group: GroupRow }, accept: boolean) {
    if (!profile) return;
    setBusy(true);
    try {
      if (accept) {
        const label = request.requester?.display_name || request.requester?.username || "عضو";
        const { error: memberError } = await supabase.from("group_members").insert({ group_id: request.group_id, profile_id: request.requester_id, added_by: profile.id, membership_status: "accepted", display_label: label, amount_due: 0, amount_paid: 0 });
        if (memberError) throw memberError;
      }
      const { error } = await supabase.from("group_join_requests").update({ status: accept ? "accepted" : "rejected" }).eq("id", request.id);
      if (error) throw error;
      await loadGroups(profile.id);
      notify(accept ? "تم قبول طلب الانضمام." : "تم رفض طلب الانضمام.", accept ? "ok" : "warn");
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر معالجة الطلب.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-white" dir="rtl"><div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 px-8 py-6">جار التحميل...</div></main>;
  }

  function renderGroupCard(group: GroupRow, publicReadOnly = false) {
    const members = groupMembers(group);
    const isCreator = group.created_by === profile?.id;
    const myMember = acceptedMember(group, profile?.id);
    const canManageMoney = isCreator || Boolean(myMember?.is_money_manager);
    const totals = groupTotals(group);

    return (
      <div className={cardClass()}>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${group.group_type === "qutiyyah" ? "bg-amber-300 text-slate-950" : "bg-sky-300 text-slate-950"}`}>{group.group_type === "qutiyyah" ? "قطيّة" : "ترتيب"}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">{group.visibility === "public" ? "عام" : "خاص"}</span>
              {isCreator ? <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-black text-slate-950">أنت الأدمن</span> : null}
            </div>
            <h2 className="text-3xl font-black">{group.name}</h2>
            {group.description ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/65">{group.description}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
              {group.event_date ? <span className="rounded-full bg-black/20 px-3 py-1">التاريخ: {group.event_date}</span> : null}
              {group.event_time ? <span className="rounded-full bg-black/20 px-3 py-1">الوقت: {group.event_time.slice(0, 5)}</span> : null}
              {group.location_name ? <span className="rounded-full bg-black/20 px-3 py-1">المكان: {group.location_name}</span> : null}
              {group.location_url ? <a className="rounded-full bg-black/20 px-3 py-1 text-sky-200 underline" href={group.location_url} target="_blank" rel="noreferrer">رابط الموقع</a> : null}
            </div>
          </div>
          {!publicReadOnly ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button className={buttonClass("ghost")} onClick={() => copyShareLink(group)} type="button">نسخ رابط المشاركة</button>
              {isCreator ? <button className={buttonClass("danger")} onClick={() => deleteGroup(group)} disabled={busy} type="button">حذف القروب</button> : null}
            </div>
          ) : null}
        </div>

        {group.location_lat !== null && group.location_lng !== null ? (
          <div className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60">
            <iframe
              className="h-56 w-full border-0"
              title={`خريطة ${group.name}`}
              src={miniMapUrl({ lat: group.location_lat, lng: group.location_lng })}
              loading="lazy"
            />
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-bold text-white/80">{group.location_name || "موقع القروب"}</span>
              <a className="text-emerald-200 underline" href={openStreetMapUrl({ lat: group.location_lat, lng: group.location_lng })} target="_blank" rel="noreferrer">فتح الخريطة</a>
            </div>
          </div>
        ) : null}

        {group.group_type === "qutiyyah" ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-white/50">الإجمالي المطلوب</p><p className="text-2xl font-black text-amber-200">{formatMoney(totals.due || group.total_amount)}</p></div>
            <div className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-white/50">المدفوع</p><p className="text-2xl font-black text-emerald-200">{formatMoney(totals.paid)}</p></div>
            <div className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-white/50">المتبقي</p><p className="text-2xl font-black text-rose-200">{formatMoney(Math.max(0, (totals.due || Number(group.total_amount ?? 0)) - totals.paid))}</p></div>
          </div>
        ) : null}

        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-8 text-center text-white/55">ما فيه أعضاء مقبولين حالياً.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {members.map((member) => {
              const canEditSelfStatus = member.profile_id === profile?.id || isCreator;
              const canEditLabel = isCreator;
              const canEditNote = member.profile_id === profile?.id || isCreator;
              const canEditMoney = group.group_type === "qutiyyah" && (canManageMoney || isCreator);
              const responseTone = member.response === "yes" ? "border-emerald-300/50 bg-emerald-400/15" : member.response === "no" ? "border-rose-300/50 bg-rose-500/15" : "border-white/10 bg-slate-950/55";
              return (
                <div key={member.id} className={`rounded-3xl border p-4 ${responseTone}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black">{memberName(member, group)}</h3>
                        {member.profile_id === group.created_by ? <span className="rounded-full bg-amber-300 px-2 py-1 text-[11px] font-black text-slate-950">أدمن</span> : null}
                        {member.is_money_manager ? <span className="rounded-full bg-sky-300 px-2 py-1 text-[11px] font-black text-slate-950">مسؤول قطيّة</span> : null}
                      </div>
                      {member.note ? <p className="mt-1 text-sm text-white/60">{member.note}</p> : null}
                    </div>
                    <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/70">{member.response === "yes" ? "صح" : member.response === "no" ? "لا" : "بدون قرار"}</span>
                  </div>

                  {group.group_type === "arrangement" ? (
                    <div className="mb-3 grid grid-cols-3 gap-2">
                      <button className={`${buttonClass("primary")} py-2`} onClick={() => updateGroupResponse(group, member, "yes")} disabled={!canEditSelfStatus || busy || publicReadOnly} type="button">صح</button>
                      <button className={`${buttonClass("danger")} py-2`} onClick={() => updateGroupResponse(group, member, "no")} disabled={!canEditSelfStatus || busy || publicReadOnly} type="button">لا</button>
                      <button className={`${buttonClass("ghost")} py-2`} onClick={() => updateGroupResponse(group, member, null)} disabled={!canEditSelfStatus || busy || publicReadOnly} type="button">بدون</button>
                    </div>
                  ) : (
                    <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl bg-black/20 p-3"><span className="block text-xs text-white/50">عليه</span><b>{formatMoney(member.amount_due)}</b></div>
                      <div className="rounded-2xl bg-black/20 p-3"><span className="block text-xs text-white/50">دفع</span><b>{formatMoney(member.amount_paid)}</b></div>
                    </div>
                  )}

                  {!publicReadOnly && (canEditLabel || canEditNote || canEditMoney) ? (
                    <div className="space-y-2 border-t border-white/10 pt-3">
                      {canEditLabel ? <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" value={memberLabelEdits[member.id] ?? memberName(member, group)} onChange={(event) => setMemberLabelEdits((rows) => ({ ...rows, [member.id]: event.target.value }))} placeholder="اسم العضو داخل القروب" /> : null}
                      {canEditNote ? <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" value={memberNoteEdits[member.id] ?? member.note ?? ""} onChange={(event) => setMemberNoteEdits((rows) => ({ ...rows, [member.id]: event.target.value }))} placeholder="ملاحظة" /> : null}
                      {canEditMoney ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" value={memberDueEdits[member.id] ?? String(member.amount_due ?? "")} onChange={(event) => setMemberDueEdits((rows) => ({ ...rows, [member.id]: event.target.value }))} placeholder="المطلوب" inputMode="decimal" />
                          <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" value={memberPaidEdits[member.id] ?? String(member.amount_paid ?? "")} onChange={(event) => setMemberPaidEdits((rows) => ({ ...rows, [member.id]: event.target.value }))} placeholder="المدفوع" inputMode="decimal" />
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button className={`${buttonClass("ghost")} py-2`} onClick={() => saveMemberDetails(group, member)} disabled={busy} type="button">حفظ</button>
                        {isCreator && group.group_type === "qutiyyah" && member.profile_id !== profile?.id ? <button className={`${buttonClass("sky")} py-2`} onClick={() => toggleMoneyManager(group, member)} disabled={busy} type="button">{member.is_money_manager ? "إلغاء مسؤول" : "مسؤول قطيّة"}</button> : null}
                        {(isCreator || member.profile_id === profile?.id) ? <button className={`${buttonClass("danger")} py-2`} onClick={() => removeGroupMember(group, member)} disabled={busy} type="button">{member.profile_id === profile?.id ? "خروج" : "إزالة"}</button> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {!publicReadOnly && isCreator ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="mb-3 font-black">دعوة أصدقاء إضافيين</p>
            <div className="flex flex-wrap gap-2">
              {friends.filter((friend) => !group.members.some((member) => member.profile_id === friend.user.id)).length === 0 ? <p className="text-sm text-white/50">كل أصدقائك موجودين أو مدعوين.</p> : null}
              {friends.filter((friend) => !group.members.some((member) => member.profile_id === friend.user.id)).map((friend) => <button key={friend.friendshipId} className={`${buttonClass("ghost")} py-2`} onClick={() => inviteFriendToGroup(group, friend)} disabled={busy} type="button">دعوة {friend.label}</button>)}
            </div>
          </div>
        ) : null}

        {publicReadOnly && group.visibility === "public" && group.allow_join_requests ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-center">
            <p className="mb-3 text-sm text-white/70">القروب عام. إذا عندك حساب تقدر تطلب الانضمام من الأدمن.</p>
            <button className={buttonClass("primary")} onClick={() => requestJoin(group)} disabled={busy || !profile} type="button">طلب الانضمام</button>
            {!profile ? <p className="mt-2 text-xs text-white/50">سجل دخول أولاً ثم افتح الرابط مرة ثانية.</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  const publicGroupOnly = groupParam && !profile;

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#0f766e_0%,#0f172a_42%,#020617_100%)] text-white" dir="rtl">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className={`flex flex-col gap-4 ${profile ? "sm:flex-row sm:items-center sm:justify-between" : "items-center text-center"}`}>
          <div className={profile ? undefined : "mx-auto max-w-xl"}>
            <p className="text-sm font-semibold text-emerald-300">شالترتيب!؟</p>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">رتّب القروب بدون شات</h1>
          </div>
          {profile ? (
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass(view === "home" ? "primary" : "ghost")} onClick={() => setView("home")}>الرئيسية</button>
              <button className={buttonClass(view === "notifications" ? "primary" : "ghost")} onClick={() => setView("notifications")}>التنبيهات {notificationCount > 0 ? `(${notificationCount})` : ""}</button>
              <button className={buttonClass(view === "settings" ? "primary" : "ghost")} onClick={() => setView("settings")}>الإعدادات</button>
              <button className={buttonClass("ghost")} onClick={signOut}>خروج</button>
            </div>
          ) : null}
        </header>

        <ToastBanner toast={toast} />
        {mapPickerOpen ? (
          <MapPickerModal
            initialPoint={newGroupLocationPoint}
            onCancel={() => setMapPickerOpen(false)}
            onPick={(point) => {
              setNewGroupLocationPoint(point);
              setNewGroupLocationUrl(openStreetMapUrl(point));
              setMapPickerOpen(false);
              notify("تم تحديد المكان على الخريطة.");
            }}
          />
        ) : null}

        {publicGroupOnly ? (
          <section className="flex-1 py-8">
            {publicGroup ? renderGroupCard(publicGroup, true) : <div className={cardClass("text-center")}>{publicGroupBlocked ? "القروب خاص أو الرابط غير صحيح." : "جار تحميل القروب..."}</div>}
            <div className="mx-auto mt-5 max-w-md">{renderAuthCard()}</div>
          </section>
        ) : null}

        {!publicGroupOnly && view === "auth" ? <section className="grid flex-1 place-items-center py-12">{renderAuthCard()}</section> : null}

        {!publicGroupOnly && view === "home" ? (
          <section className="flex flex-1 items-center py-8">
            <div className="grid w-full gap-5 md:grid-cols-2">
              <button className="group min-h-[220px] rounded-[2rem] border border-white/10 bg-slate-950/65 p-8 text-center shadow-2xl transition hover:-translate-y-1 hover:border-emerald-300/50 hover:bg-slate-900" onClick={() => setView("friends")} type="button">
                <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-emerald-300 text-4xl text-slate-950 shadow-lg shadow-emerald-300/25">👥</span>
                <h2 className="mt-6 text-4xl font-black">الأصدقاء</h2>
              </button>
              <button className="group min-h-[220px] rounded-[2rem] border border-white/10 bg-slate-950/65 p-8 text-center shadow-2xl transition hover:-translate-y-1 hover:border-sky-300/50 hover:bg-slate-900" onClick={() => setView("groups")} type="button">
                <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-sky-300 text-4xl text-slate-950 shadow-lg shadow-sky-300/25">▦</span>
                <h2 className="mt-6 text-4xl font-black">القروبات</h2>
              </button>
            </div>
          </section>
        ) : null}

        {!publicGroupOnly && view === "friends" ? renderFriendsView() : null}
        {!publicGroupOnly && view === "groups" ? renderGroupsView() : null}
        {!publicGroupOnly && view === "notifications" ? renderNotificationsView() : null}
        {!publicGroupOnly && view === "settings" ? renderSettingsView() : null}
      </div>
    </main>
  );

  function renderAuthCard() {
    return (
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 flex rounded-2xl bg-black/20 p-1">
          <button className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${mode === "login" ? "bg-emerald-300 text-slate-950" : "text-white/70"}`} onClick={() => setMode("login")} type="button">دخول</button>
          <button className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${mode === "signup" ? "bg-emerald-300 text-slate-950" : "text-white/70"}`} onClick={() => setMode("signup")} type="button">حساب جديد</button>
        </div>
        <form className="space-y-4" onSubmit={handleAuth}>
          <label className="block"><span className="mb-2 block text-sm text-white/70">اسم المستخدم</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="مثال: borashid" autoComplete="username" /></label>
          {mode === "signup" ? <label className="block"><span className="mb-2 block text-sm text-white/70">الاسم الظاهر اختياري</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="مثال: بوراشد" /></label> : null}
          <label className="block"><span className="mb-2 block text-sm text-white/70">كلمة المرور</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none ring-emerald-300/50 focus:ring-4" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          <button className={`${buttonClass()} w-full`} disabled={busy}>{busy ? "انتظر..." : mode === "login" ? "دخول" : "إنشاء الحساب"}</button>
        </form>
      </div>
    );
  }

  function renderFriendsView() {
    return (
      <section className="flex-1 py-8">
        <div className={cardClass()}>
          <div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black">الأصدقاء</h2><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">{friends.length}</span></div>
          {friends.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-8 text-center text-white/55">ما عندك أصدقاء. أضفهم بالكود من الإعدادات.</div> : (
            <div className="space-y-2">
              {friends.map((friend) => {
                const expanded = expandedFriendId === friend.friendshipId;
                return <div key={friend.friendshipId} className={`rounded-2xl border ${expanded ? "border-emerald-300/50 bg-slate-950/80" : "border-white/10 bg-slate-950/55"}`}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right" onClick={() => setExpandedFriendId(expanded ? null : friend.friendshipId)} type="button"><span><b className="block text-lg">{friend.label}</b><span className="text-xs text-emerald-300">@{friend.user.username}</span></span><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-lg">{expanded ? "−" : "+"}</span></button>
                  {expanded ? <div className="border-t border-white/10 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" value={friendLabelEdits[friend.friendshipId] ?? friend.label} onChange={(event) => setFriendLabelEdits((rows) => ({ ...rows, [friend.friendshipId]: event.target.value }))} /><div className="flex gap-2"><button className={`${buttonClass("primary")} py-2`} onClick={() => saveFriendLabel(friend)} disabled={busy}>حفظ</button><button className={`${buttonClass("danger")} py-2`} onClick={() => deleteFriend(friend)} disabled={busy}>حذف</button></div></div></div> : null}
                </div>;
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderGroupsView() {
    return (
      <section className="flex-1 py-8">
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className={cardClass()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl font-black">قروباتك</h2><button className={buttonClass("ghost")} onClick={() => setView("settings")} type="button">إنشاء قروب</button></div>
            {activeGroups.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-6 text-center text-sm text-white/55">ما عندك قروبات نشطة.</div> : <div className="space-y-3">{activeGroups.map((group) => <button key={group.id} className={`w-full rounded-2xl border p-4 text-right transition ${selectedGroup?.id === group.id ? "border-emerald-300/60 bg-emerald-300/15" : "border-white/10 bg-slate-950/60 hover:border-emerald-300/40"}`} onClick={() => setSelectedGroup(group)} type="button"><div className="flex items-center justify-between gap-2"><b>{group.name}</b><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{group.group_type === "qutiyyah" ? "قطيّة" : "ترتيب"}</span></div><p className="mt-1 text-xs text-white/50">{groupMembers(group).length} أعضاء · {group.visibility === "public" ? "عام" : "خاص"}</p></button>)}</div>}
          </div>
          <div>{selectedGroup ? renderGroupCard(selectedGroup) : <div className={cardClass("grid min-h-[420px] place-items-center text-center text-white/55")}>اختر قروب من القائمة.</div>}</div>
        </div>
      </section>
    );
  }

  function renderNotificationsView() {
    return (
      <section className="flex-1 py-8"><div className="space-y-5">
        <div className={cardClass()}><h2 className="mb-4 text-2xl font-black">دعوات الأصدقاء</h2>{incomingRequests.length === 0 ? <p className="text-sm text-white/50">ما فيه دعوات أصدقاء.</p> : <div className="grid gap-3 md:grid-cols-2">{incomingRequests.map((request) => <div key={request.id} className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-white/50">دعوة من</p><p className="font-bold">{request.requester?.display_name || request.requester?.username || "مستخدم"}</p><p className="text-sm text-emerald-300">@{request.requester?.username}</p><input className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none" value={acceptLabels[request.id] ?? ""} onChange={(event) => setAcceptLabels((rows) => ({ ...rows, [request.id]: event.target.value }))} placeholder="الاسم اللي بيظهر عندك" /><div className="mt-3 grid grid-cols-2 gap-2"><button className={`${buttonClass()} py-2`} onClick={() => acceptFriendship(request)} disabled={busy}>قبول</button><button className={`${buttonClass("danger")} py-2`} onClick={() => rejectFriendship(request)} disabled={busy}>رفض</button></div></div>)}</div>}</div>
        <div className={cardClass()}><h2 className="mb-4 text-2xl font-black">دعوات القروبات</h2>{groupInvitations.length === 0 ? <p className="text-sm text-white/50">ما فيه دعوات قروبات.</p> : <div className="grid gap-3 md:grid-cols-2">{groupInvitations.map((group) => <div key={group.id} className="rounded-2xl bg-black/20 p-4"><p className="font-black">{group.name}</p><p className="text-xs text-white/50">{group.group_type === "qutiyyah" ? "قطيّة" : "ترتيب"}</p><div className="mt-3 grid grid-cols-2 gap-2"><button className={`${buttonClass("primary")} py-2`} onClick={() => acceptGroupInvite(group)} disabled={busy} type="button">قبول</button><button className={`${buttonClass("danger")} py-2`} onClick={() => rejectGroupInvite(group)} disabled={busy} type="button">رفض</button></div></div>)}</div>}</div>
        <div className={cardClass()}><h2 className="mb-4 text-2xl font-black">طلبات الانضمام لقروباتك</h2>{pendingJoinRequests.length === 0 ? <p className="text-sm text-white/50">ما فيه طلبات انضمام.</p> : <div className="grid gap-3 md:grid-cols-2">{pendingJoinRequests.map((request) => <div key={request.id} className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-white/50">طلب دخول إلى {request.group.name}</p><p className="font-bold">{request.requester?.display_name || request.requester?.username || "مستخدم"}</p><p className="text-sm text-emerald-300">@{request.requester?.username}</p><div className="mt-3 grid grid-cols-2 gap-2"><button className={`${buttonClass("primary")} py-2`} onClick={() => decideJoinRequest(request, true)} disabled={busy} type="button">قبول</button><button className={`${buttonClass("danger")} py-2`} onClick={() => decideJoinRequest(request, false)} disabled={busy} type="button">رفض</button></div></div>)}</div>}</div>
      </div></section>
    );
  }

  function renderSettingsView() {
    return (
      <section className="flex-1 py-8"><div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div className={cardClass()}><h3 className="mb-2 text-xl font-black">الحساب</h3><p className="text-sm text-white/60">داخل باسم</p><h4 className="text-2xl font-black">{profile?.display_name || profile?.username}</h4><p className="text-sm text-emerald-300">@{profile?.username}</p></div>
          <div className={cardClass()}><h3 className="mb-2 text-xl font-black">الأصدقاء والإضافة</h3><p className="mb-4 text-sm text-white/55">كودك وإضافة صديق جديد.</p><div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="text-xs text-white/60">كود الإضافة الخاص فيك</p><button className="mt-2 w-full rounded-xl bg-slate-950/70 px-4 py-3 font-mono text-2xl font-black tracking-[0.35em] text-emerald-200" onClick={async () => { if (profile?.invite_code) { await navigator.clipboard?.writeText(profile.invite_code); notify("تم نسخ كود الإضافة."); } }} type="button">{profile?.invite_code || "--------"}</button></div><form className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4" onSubmit={addFriend}><input className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-lg tracking-[0.25em] text-white outline-none" value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} placeholder="كود الصديق" maxLength={8} dir="ltr" /><input className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" value={friendLabel} onChange={(event) => setFriendLabel(event.target.value)} placeholder="الاسم عندك" maxLength={40} /><button className={`${buttonClass()} w-full`} disabled={busy}>إرسال طلب</button></form>{outgoingRequests.length > 0 ? <div className="mt-4 rounded-2xl bg-black/15 p-4"><h4 className="mb-2 font-black">طلبات مرسلة</h4>{outgoingRequests.map((request) => <p key={request.id} className="text-sm text-white/70">بانتظار @{request.addressee?.username}</p>)}</div> : null}</div>
        </div>
        <div className={cardClass()}><h3 className="mb-2 text-xl font-black">إنشاء قروب</h3><p className="mb-4 text-sm text-white/55">قروب ترتيب أو قطيّة مع رابط مشاركة.</p><form className="space-y-3" onSubmit={createGroup}><div className="grid grid-cols-2 gap-2"><button className={buttonClass(newGroupType === "arrangement" ? "primary" : "ghost")} onClick={() => setNewGroupType("arrangement")} type="button">ترتيب</button><button className={buttonClass(newGroupType === "qutiyyah" ? "primary" : "ghost")} onClick={() => setNewGroupType("qutiyyah")} type="button">قطيّة</button></div><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="اسم القروب" maxLength={80} /><textarea className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" value={newGroupDescription} onChange={(event) => setNewGroupDescription(event.target.value)} placeholder="تفاصيل القروب" /><div className="grid grid-cols-2 gap-2"><input className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" type="date" value={newGroupDate} onChange={(event) => setNewGroupDate(event.target.value)} /><input className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" type="time" value={newGroupTime} onChange={(event) => setNewGroupTime(event.target.value)} /></div><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" value={newGroupLocation} onChange={(event) => setNewGroupLocation(event.target.value)} placeholder="اسم المكان اختياري" /><div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15"><button className={`${buttonClass("sky")} w-full rounded-none`} onClick={() => setMapPickerOpen(true)} type="button">{newGroupLocationPoint ? "تغيير المكان في الخريطة" : "تحديد المكان في الخريطة"}</button>{newGroupLocationPoint ? <><iframe className="h-44 w-full border-0" title="معاينة موقع القروب" src={miniMapUrl(newGroupLocationPoint)} loading="lazy" /><div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white/60"><span dir="ltr">{newGroupLocationPoint.lat}, {newGroupLocationPoint.lng}</span><button className="font-bold text-rose-200 underline" onClick={() => { setNewGroupLocationPoint(null); setNewGroupLocationUrl(""); }} type="button">مسح الموقع</button></div></> : <p className="px-4 py-3 text-sm text-white/50">اختياري: اختر نقطة على الخريطة عشان تظهر مصغرة داخل القروب.</p>}</div><div className="grid grid-cols-2 gap-2"><button className={buttonClass(newGroupVisibility === "private" ? "primary" : "ghost")} onClick={() => setNewGroupVisibility("private")} type="button">خاص</button><button className={buttonClass(newGroupVisibility === "public" ? "primary" : "ghost")} onClick={() => setNewGroupVisibility("public")} type="button">عام</button></div>{newGroupVisibility === "public" ? <label className="flex items-center justify-between rounded-2xl bg-black/20 p-4"><span className="font-bold">السماح بطلبات الانضمام</span><input className="h-5 w-5 accent-emerald-300" type="checkbox" checked={allowJoinRequests} onChange={(event) => setAllowJoinRequests(event.target.checked)} /></label> : null}{newGroupType === "qutiyyah" ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><input className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" value={newTotalAmount} onChange={(event) => setNewTotalAmount(event.target.value)} placeholder="المبلغ الإجمالي اختياري" inputMode="decimal" /><label className="flex items-center justify-between"><span className="font-bold">تقسيم تلقائي على الأعضاء</span><input className="h-5 w-5 accent-amber-300" type="checkbox" checked={autoSplitAmount} onChange={(event) => setAutoSplitAmount(event.target.checked)} /></label></div> : null}<div className="max-h-56 space-y-2 overflow-auto rounded-2xl border border-white/10 bg-black/15 p-3">{friends.length === 0 ? <p className="text-sm text-white/50">أضف أصدقاء أولاً لو تبي تدعوهم.</p> : friends.map((friend) => <label key={friend.friendshipId} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 ${selectedGroupFriendIds.includes(friend.user.id) ? "border-emerald-300/60 bg-emerald-300/15" : "border-white/10 bg-black/20"}`}><span><b className="block">{friend.label}</b><span className="text-xs text-emerald-300">@{friend.user.username}</span></span><input className="h-5 w-5 accent-emerald-300" type="checkbox" checked={selectedGroupFriendIds.includes(friend.user.id)} onChange={() => toggleGroupFriend(friend.user.id)} /></label>)}</div><button className={`${buttonClass()} w-full`} disabled={busy}>إنشاء القروب</button></form></div>
      </div></section>
    );
  }
}
