export type EventSide = {
  name: string;
  artwork: string | null;
  logo: string | null;
};
export type EventParticipant = {
  id: string;
  side: number;
  characterName: string;
  playerIdentity: string;
  characterClass: string;
  linked: boolean;
};
export type WorldEvent = {
  id: string;
  title: string;
  kind: "regular" | "major";
  date: string;
  venue: string;
  story: string;
  aftermath: string;
  locationId: string | null;
  published: boolean;
  sides: EventSide[];
  participants: EventParticipant[];
  revision: number;
};
export type EventProfile = {
  name: string;
  title: string;
  bio: string;
  image: string;
};
export type EventLink = {
  participantId: string;
  uid: string;
  name: string;
  status: "pending" | "approved";
};
