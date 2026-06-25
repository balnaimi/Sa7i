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

export type GroupType = "arrangement" | "qutiyyah";
export type GroupVisibility = "public" | "private";
export type GroupResponse = "yes" | "no" | null;
export type GroupMembershipStatus = "invited" | "accepted";
export type JoinRequestStatus = "pending" | "accepted" | "rejected";

export type ShaltarteebGroup = {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  group_type: GroupType;
  event_date: string | null;
  event_time: string | null;
  location_name: string | null;
  location_url: string | null;
  visibility: GroupVisibility;
  allow_join_requests: boolean;
  total_amount: number | null;
  auto_split_amount: boolean;
  created_at: string;
  updated_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  profile_id: string;
  added_by: string;
  membership_status: GroupMembershipStatus;
  display_label: string | null;
  response: GroupResponse;
  note: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  is_money_manager: boolean;
  responded_at: string | null;
  created_at: string;
  profile?: Profile;
};

export type GroupJoinRequest = {
  id: string;
  group_id: string;
  requester_id: string;
  status: JoinRequestStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  requester?: Profile;
  group?: ShaltarteebGroup;
};
