"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthPageLayout } from "@/components/auth-page-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRight } from "lucide-react";

async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Use the standard fallback below for non-JSON errors.
  }
  return "Could not sign in. Check your details and try again.";
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (response.ok) router.replace("/chat");
      })
      .finally(() => {
        if (mounted) setCheckingSession(false);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readDetail(response));
      router.replace("/chat");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageLayout
      storyHeading={<>Make room<br />for better ideas.</>}
      storyDescription="A thoughtful workspace for your questions, projects, and conversations."
      kicker="WELCOME BACK"
      heading="Sign in to myagent"
      description="Continue where your thinking left off."
      alternatePrompt="New to myagent?"
      alternateHref="/signup"
      alternateLabel="Create an account"
    >
      {checkingSession ? (
        <div className="signin-checking" role="status">
          <Spinner /> Checking your session…
        </div>
      ) : (
        <form className="signin-form" onSubmit={(event) => void signIn(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </Field>
            <Field>
              <div className="password-label-row">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldDescription>12 characters minimum</FieldDescription>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
              />
            </Field>
          </FieldGroup>

          {error && <Alert className="form-error" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <Button className="signin-submit" type="submit" disabled={submitting}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? "Signing in…" : "Sign in"}
            {!submitting && <ArrowRight data-icon="inline-end" />}
          </Button>
        </form>
      )}
    </AuthPageLayout>
  );
}
