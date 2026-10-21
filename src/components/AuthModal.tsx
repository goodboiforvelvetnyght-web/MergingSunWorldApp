import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { auth } from "../firebase";
import { friendlyError } from "../useWorld";
import { Modal } from "./Modal";
export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
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
        else await signInWithEmailAndPassword(auth, email, password);
        onClose();
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
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
      <form onSubmit={submit} className="form-stack">
        <label>
          Email address
          <input
            type="email"
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
        <button className="button primary" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ArrowRight size={18} />
          )}{" "}
          {mode === "register"
            ? "Create account"
            : mode === "reset"
              ? "Send reset link"
              : "Sign in"}
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode("reset");
              setError("");
            }}
          >
            Forgot password?
          </button>
        )}
        <div className="form-footer">
          {mode === "login" ? "New to the world?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setMessage("");
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </div>
        <p className="fine-print">
          Signing in uses Firebase. Demo edits and the demo traveler stay in
          this browser and are not transferred to your account.
        </p>
      </form>
    </Modal>
  );
}
