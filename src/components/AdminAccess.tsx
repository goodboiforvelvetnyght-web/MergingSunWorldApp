import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Check, Copy, KeyRound, LoaderCircle, Shield, Sun } from "lucide-react";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import { call, friendlyError } from "../useWorld";

type Invitation = {
  id: string;
  createdAt: number;
  expiresAt: number;
  usedBy: string | null;
  revokedAt: number | null;
};
export function AdminInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [issued, setIssued] = useState<{
      key: string;
      id: string;
      expiresAt: number;
    } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "adminInvitations"),
          orderBy("createdAt", "desc"),
          limit(20),
        ),
        (s) =>
          setInvitations(
            s.docs.map((d) => ({ id: d.id, ...d.data() }) as Invitation),
          ),
        (e) => setError(friendlyError(e)),
      ),
    [],
  );
  async function generate() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setIssued(await call("generateAdminInvitation", {}));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await call("revokeAdminInvitation", { id });
      if (issued?.id === id) setIssued(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-invitations">
      <summary>
        <Shield size={16} />
        Admin invitations
      </summary>
      <div className="form-stack">
        <p className="fine-print">
          An invitation grants full admin access to the first signed-in account
          that redeems it. Keys expire after 24 hours and can be used once.
        </p>
        <button
          className="button secondary full"
          disabled={busy || !!issued}
          onClick={() => void generate()}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <KeyRound size={16} />
          )}
          Generate admin invitation
        </button>
        {issued && (
          <div className="issued-invitation">
            <strong>Copy this key before closing.</strong>
            <p>The key is shown only here and cannot be retrieved later.</p>
            <code>{issued.key}</code>
            <p>Expires {new Date(issued.expiresAt).toLocaleString()}</p>
            <button
              className="button secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(issued.key)
                  .then(() => setCopied(true))
                  .catch(() => setError("Select and copy the key above."))
              }
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy key"}
            </button>
            <p>Send the key privately with this address:</p>
            <a href="/admin/activate">
              {window.location.origin}/admin/activate
            </a>
            <button className="text-button" onClick={() => setIssued(null)}>
              I have saved the key
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!!invitations.length && (
          <div className="invitation-list">
            {invitations.map((i) => (
              <div key={i.id}>
                <span>
                  Created {new Date(i.createdAt).toLocaleString()}
                  <small>
                    {i.usedBy
                      ? "Used"
                      : i.revokedAt
                        ? "Revoked"
                        : i.expiresAt <= Date.now()
                          ? "Expired"
                          : "Available until " +
                            new Date(i.expiresAt).toLocaleString()}
                  </small>
                </span>
                {!i.usedBy && !i.revokedAt && i.expiresAt > Date.now() && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => void revoke(i.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
export function AdminActivation({
  user,
  admin,
  onSignIn,
}: {
  user: User | null;
  admin: boolean;
  onSignIn: () => void;
}) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  return (
    <main className="admin-activation">
      <a className="activation-brand" href="/">
        <Sun size={26} />
        MERGING SUN
      </a>
      <section className="activation-card">
        <Shield size={36} />
        <span className="eyebrow">THE WORLD'S KEEPERS</span>
        <h1>Admin access</h1>
        {success || admin ? (
          <>
            <p role="status">Your account has admin access.</p>
            <a className="button primary" href="/">
              Enter the world
            </a>
          </>
        ) : !user ? (
          <>
            <p>
              Sign in with the account you want to make an admin, then enter
              your private activation key.
            </p>
            <button className="button primary" onClick={onSignIn}>
              Sign in
            </button>
          </>
        ) : (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await call("redeemAdminInvitation", { key: key.trim() });
                setKey("");
                setSuccess(true);
              } catch (err) {
                setError(friendlyError(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Signed in as <strong>{user.email}</strong>. Redeeming this key
              gives this account full admin access.
            </p>
            <label>
              Activation key
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="MSA-…"
              />
            </label>
            <p className="fine-print">
              Invitations are single-use and expire. Ask an existing admin for a
              new key if yours is no longer valid.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy || !key.trim()}>
              {busy && <LoaderCircle className="spin" size={17} />}Activate
              admin access
            </button>
          </form>
        )}
      </section>
      <a href="/">Back to the atlas</a>
    </main>
  );
}
