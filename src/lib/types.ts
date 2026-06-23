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
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
  requester?: Profile;
  addressee?: Profile;
};

export type WakeSignal = {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: "صاحي ؟" | "صاحي..";
  seen_at: string | null;
  created_at: string;
};
