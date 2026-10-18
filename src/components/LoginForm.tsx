"use client";

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/lib/api/client";
import { getClientAuth } from "@/lib/firebase/client";
import { Button, Field, inputClass } from "./ui";

type Mode = "signin" | "signup";

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof FirebaseError) {
    switch (error.code) {
      // Deliberately one message for "no such user" and "wrong password", so the
      // form cannot be used to discover which emails have accounts.
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "Could not create the account. Try signing in instead.";
      case "auth/weak-password":
        return "Choose a stronger password (at least 8 characters).";
      case "auth/invalid-email":
        return "Enter a valid email address.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a few minutes and try again.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function LoginForm({ showDemoHint }: { showDemoHint: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "signup" && password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    setPending(true);
    const auth = getClientAuth();
    try {
      const credential =
        mode === "signin"
          ? await signInWithEmailAndPassword(auth, email.trim(), password)
          : await createUserWithEmailAndPassword(auth, email.trim(), password);

      // Hand the short-lived ID token to our server (POST body, never a URL). The
      // server verifies it and replies with an httpOnly session cookie.
      const idToken = await credential.user.getIdToken();
      await api("/api/auth/session", { method: "POST", body: { idToken } });

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(messageFor(err));
      setPending(false);
    } finally {
      // The browser has no further use for the Firebase session; drop it from memory.
      await signOut(auth).catch(() => {});
    }
  }

  const isSignUp = mode === "signup";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold">{isSignUp ? "Create an account" : "Sign in"}</h2>

      <Field id="email" label="Email">
        {(aria) => (
          <input
            {...aria}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>

      <Field
        id="password"
        label="Password"
        hint={isSignUp ? "At least 8 characters. New accounts start as viewers; an admin can change your role." : undefined}
      >
        {(aria) => (
          <input
            {...aria}
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        )}
      </Field>

      {/* role="alert" makes screen readers announce the error as soon as it appears */}
      <div role="alert" className="min-h-5 text-sm text-red-600">
        {error}
      </div>

      <Button type="submit" className="w-full" disabled={pending || !email || !password}>
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-slate-600">
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="font-medium text-indigo-600 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600"
          onClick={() => {
            setMode(isSignUp ? "signin" : "signup");
            setError(null);
          }}
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>

      {showDemoHint && (
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Local demo accounts (after <code>npm run seed</code>)</p>
          <p>admin@example.com: full access</p>
          <p>viewer@example.com: read-only</p>
          <p>
            Password for both: <code>Passw0rd!demo</code>
          </p>
        </div>
      )}
    </form>
  );
}
