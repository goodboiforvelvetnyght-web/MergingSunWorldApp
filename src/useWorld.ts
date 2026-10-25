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
  characterGeneration,
  type Character,
  type World,
  type Journey,
  type CharacterApplication,
} from "../shared/world";
export function useCloud() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [claimAdmin, setClaimAdmin] = useState(false),
    [roleAdmin, setRoleAdmin] = useState(false),
    [world, setWorld] = useState<World>(DEFAULT_WORLD),
    [application, setApplication] = useState<CharacterApplication | null>(null),
    [hexPopulation, setHexPopulation] = useState<Record<string, number>>({}),
    [population, setPopulation] = useState<Record<string, number>>({}),
    [character, setCharacter] = useState<Character | null>(null),
    [journeys, setJourneys] = useState<Journey[]>([]),
    [status, setStatus] = useState<"connecting" | "connected" | "unavailable">(
      "connecting",
    );
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
        setCharacter(null);
        setJourneys([]);
        setRoleAdmin(false);
        setClaimAdmin(false);
        if (u)
          void u
            .getIdTokenResult()
            .then((t) => {
              if (auth.currentUser?.uid === u.uid)
                setClaimAdmin(t.claims.admin === true);
            })
            .catch(() => setClaimAdmin(false));
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
    setRoleAdmin(false);
    setCharacter(null);
    setApplication(null);
    if (!user) return;
    const role = onSnapshot(
      doc(db, "adminRoles", user.uid),
      (s) => setRoleAdmin(s.data()?.role === "admin"),
      () => setRoleAdmin(false),
    );
    const profile = onSnapshot(
      doc(db, "characters", user.uid),
      (s) => setCharacter(s.exists() ? (s.data() as Character) : null),
      () => setStatus("unavailable"),
    );
    const submission = onSnapshot(
      doc(db, "characterApplications", user.uid),
      (s) =>
        setApplication(s.exists() ? (s.data() as CharacterApplication) : null),
      () => {},
    );
    void call("initializePopulation", {}).catch(() => {});
    return () => {
      submission();
      role();
      profile();
    };
  }, [user?.uid]);
  const generation = character ? characterGeneration(character) : null;
  useEffect(() => {
    setJourneys([]);
    if (!user || !character) return;
    const path = character.incarnationId
      ? [
          "characters",
          user.uid,
          "incarnations",
          character.incarnationId,
          "journeys",
        ]
      : ["characters", user.uid, "journeys"];
    return onSnapshot(
      query(collection(db, path.join("/")), orderBy("at", "desc"), limit(20)),
      (s) =>
        setJourneys(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Journey)),
      () => {},
    );
  }, [user?.uid, generation]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "population", "main"),
        (s) => {
          setPopulation(s.data()?.counts ?? {});
          setHexPopulation(
            s.data()?.presenceVersion === 3 ? (s.data()?.hexCounts ?? {}) : {},
          );
        },
        () => {},
      ),
    [],
  );
  const admin = claimAdmin || roleAdmin;
  return {
    user,
    authReady,
    admin,
    world,
    character,
    application,
    population,
    hexPopulation,
    journeys,
    status,
  };
}
export async function call<T>(name: string, data: unknown): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name, {
    timeout:
      name === "processMapUpload"
        ? 600000
        : name === "uploadWorldAsset"
          ? 360000
          : name === "migrateLegacyPortraits"
            ? 180000
            : 70000,
  })(data);
  return result.data;
}
export function friendlyError(e: unknown) {
  const err = e as { code?: string; message?: string };
  const known: Record<string, string> = {
    "auth/email-already-in-use":
      "An account already uses this email. Try signing in.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed":
      "Could not reach Firebase. Check your connection.",
    "auth/internal-error":
      "Could not open sign-in. Check your connection or try email and password.",
    "auth/popup-blocked":
      "Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.",
    "auth/operation-not-allowed":
      "This sign-in method is not enabled yet. Please use email and password for now.",
    "auth/account-exists-with-different-credential":
      "An account already uses this email with another sign-in method. Sign in with that method first.",
    "auth/credential-already-in-use":
      "This Google account is already connected to a different account. Use that account to sign in.",
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
