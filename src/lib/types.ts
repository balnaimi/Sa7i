export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  invite_code: string;
  created_at: string;
};

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  requester_label: string | null;
  addressee_label: string | null;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
  requester?: Profile;
  addressee?: Profile;
};

export type WakeSignalText = "صاحي ؟" | "صاحي.." | "✅" | "❌";

export type WakeSignal = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: WakeSignalText;
  seen_at: string | null;
  created_at: string;
};

export type GroupResponse = "yes" | "no" | null;

export type Sa7iGroup = {
  id: string;
  created_by: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  profile_id: string;
  added_by: string;
  response: GroupResponse;
  responded_at: string | null;
  created_at: string;
  profile?: Profile;
};
