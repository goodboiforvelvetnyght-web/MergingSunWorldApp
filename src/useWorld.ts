import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  type Character,
  type World,
  type Journey,
} from "../shared/world";
export function useCloud() {
  const [user, setUser] = useState<User | null>(null),
    [admin, setAdmin] = useState(false),
    [world, setWorld] = useState<World>(DEFAULT_WORLD),
    [character, setCharacter] = useState<Character | null>(null),
    [journeys, setJourneys] = useState<Journey[]>([]),
    [status, setStatus] = useState<"connecting" | "connected" | "unavailable">(
      "connecting",
    );
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAdmin(false);
        if (u)
          void u
            .getIdTokenResult()
            .then((t) => {
              if (auth.currentUser?.uid === u.uid)
                setAdmin(t.claims.admin === true);
            })
            .catch(() => setAdmin(false));
      }),
    [],
  );
  useEffect(
    () =>
      onSnapshot(
        doc(db, "worlds", "main"),
        { includeMetadataChanges: true },
        (s) => {
          setWorld(normalizeWorld((s.data() as World) || DEFAULT_WORLD));
          setStatus(s.metadata.fromCache ? "unavailable" : "connected");
        },
        () => setStatus("unavailable"),
      ),
    [],
  );
  useEffect(() => {
    setCharacter(null);
    setJourneys([]);
    if (!user) return;
    const a = onSnapshot(
      doc(db, "characters", user.uid),
      (s) => setCharacter(s.exists() ? (s.data() as Character) : null),
      () => setStatus("unavailable"),
    );
    const b = onSnapshot(
      query(
        collection(db, "characters", user.uid, "journeys"),
        orderBy("at", "desc"),
        limit(20),
      ),
      (s) =>
        setJourneys(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Journey)),
      () => {},
    );
    return () => {
      a();
      b();
    };
  }, [user]);
  return { user, admin, world, character, journeys, status };
}
export async function call<T>(name: string, data: unknown): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name)(data);
  return result.data;
}
export function friendlyError(e: unknown) {
  const err = e as { code?: string; message?: string };
  const known: Record<string, string> = {
    "auth/email-already-in-use":
      "An account already uses this email. Try signing in.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Could not reach Firebase. Check your connection.",
    "auth/unauthorized-domain":
      "This website domain must be added to Firebase Authentication’s authorized domains.",
    "functions/unavailable":
      "The world backend is unavailable. Deploy the included Firebase functions and rules to enable saved characters and travel.",
    "functions/internal":
      "The world backend could not complete this request. Check the Firebase deployment and try again.",
    "functions/not-found":
      "Deploy the included Firebase functions to enable this action.",
  };
  return (
    known[err.code ?? ""] ||
    err.message?.replace(/^Firebase:\s*/, "") ||
    "Something went wrong. Please try again."
  );
}
export function readLocal<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(name: string, value: unknown) {
  try {
    localStorage.setItem(name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
