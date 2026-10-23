import { useState, type FormEvent } from "react";
import type { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithCredential,
  type OAuthCredential,
} from "firebase/auth";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { auth } from "../firebase";
import { friendlyError } from "../useWorld";
import { Modal } from "./Modal";
export function AuthModal({
  onClose,
  initialMode = "login",
}: {
  onClose: () => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">(initialMode),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState<"email" | "google" | null>(null),
    [pendingGoogle, setPendingGoogle] = useState<{
      email: string;
      credential: OAuthCredential;
    } | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("email");
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setMessage(
          "If an account exists for this email, a reset link is on its way.",
        );
      } else {
        if (mode === "register")
          await createUserWithEmailAndPassword(auth, email, password);
        else {
          const result = await signInWithEmailAndPassword(
            auth,
            email,
            password,
          );
          if (pendingGoogle) {
            // Link only after the existing account's password has been verified.
            if (
              result.user.email?.toLowerCase() !==
              pendingGoogle.email.toLowerCase()
            )
              throw new Error(
                "Sign in with the account that uses this Google email address.",
              );
            await linkWithCredential(result.user, pendingGoogle.credential);
          }
        }
        onClose();
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  async function continueWithGoogle() {
    if (busy) return;
    setBusy("google");
    setError("");
    setMessage("");
    setPassword("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
      onClose();
    } catch (error) {
      const err = error as FirebaseError & { customData?: { email?: string } };
      if (err.code === "auth/account-exists-with-different-credential") {
        const credential = GoogleAuthProvider.credentialFromError(err);
        if (credential && typeof err.customData?.email === "string") {
          setPendingGoogle({ email: err.customData.email, credential });
          setEmail(err.customData.email);
          setMode("login");
          setMessage(
            "This email already has an account. Enter its password to connect Google and keep your existing character.",
          );
        } else setError(friendlyError(error));
      } else if (
        !["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(
          err.code,
        )
      ) {
        setError(friendlyError(error));
      }
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal
      title={
        mode === "register"
          ? "Your story starts here"
          : mode === "reset"
            ? "Find your way back"
            : "Welcome back, traveler"
      }
      subtitle="One account. Your own place in the world."
      onClose={onClose}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {mode !== "reset" && !pendingGoogle && (
        <div className="auth-provider-options">
          <button
            type="button"
            className="button google-sign-in full"
            disabled={!!busy}
            onClick={() => void continueWithGoogle()}
          >
            {busy === "google" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
          <p className="fine-print">
            Already have a character? Choose the Google account with the same
            email as your existing account.
          </p>
          <div className="auth-divider">
            <span>or use email</span>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="form-stack">
        <label>
          Email address
          <input
            type="email"
            disabled={!!busy || !!pendingGoogle}
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              disabled={!!busy}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength={mode === "register" ? 8 : 1}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === "register" ? "At least 8 characters" : "Your password"
              }
            />
          </label>
        )}
        <button className="button primary" disabled={!!busy}>
          {busy === "email" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ArrowRight size={18} />
          )}{" "}
          {mode === "register"
            ? "Create account"
            : mode === "reset"
              ? "Send reset link"
              : pendingGoogle
                ? "Sign in and connect Google"
                : "Sign in"}
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="text-button"
            disabled={!!busy}
            onClick={() => {
              setMode("reset");
              setError("");
            }}
          >
            Forgot password?
          </button>
        )}
        {pendingGoogle && mode === "login" ? (
          <div className="form-footer">
            <button
              type="button"
              className="text-button"
              disabled={!!busy}
              onClick={() => {
                setPendingGoogle(null);
                setPassword("");
                setError("");
                setMessage("");
              }}
            >
              Use another sign-in method
            </button>
          </div>
        ) : (
          <div className="form-footer">
            {mode === "login"
              ? "New to the world?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-button"
              disabled={!!busy}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
        )}
        <p className="fine-print">
          Signing in uses Firebase. Demo edits and the demo traveler stay in
          this browser and are not transferred to your account.
        </p>
      </form>
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.61 24.46c0-1.36-.12-2.65-.35-3.92H24v7.85h11.02a9.43 9.43 0 0 1-4.08 6.18v5.13h6.61c3.87-3.57 6.06-8.83 6.06-15.24Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.51 0 10.13-1.82 13.5-4.94l-6.6-5.13c-1.83 1.23-4.16 1.98-6.9 1.98-5.32 0-9.83-3.59-11.44-8.43H5.75v5.29A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.56 27.48A12 12 0 0 1 12 24c0-1.21.2-2.38.56-3.48v-5.29H5.75A20 20 0 0 0 4 24c0 3.23.77 6.28 1.75 8.77l6.81-5.29Z"
      />
      <path
        fill="#EA4335"
        d="M24 12.09c3.01 0 5.71 1.04 7.84 3.08l5.87-5.87C34.12 5.95 29.51 4 24 4A20 20 0 0 0 5.75 15.23l6.81 5.29C14.17 15.68 18.68 12.09 24 12.09Z"
      />
    </svg>
  );
}
