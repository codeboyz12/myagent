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
      return body.detail === "Public signup is disabled."
        ? "Signup is currently disabled. Ask your workspace operator to enable it."
        : body.detail;
    }
  } catch {
    // Use the standard fallback below for non-JSON errors.
  }
  return "Could not create your account. Please try again.";
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const signUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
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
          : "Could not create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageLayout
      storyHeading={<>Start with<br />a fresh page.</>}
      storyDescription="Create your account and keep your questions, projects, and conversations together."
      kicker="GET STARTED"
      heading="Create your account"
      description="A few details, then you’re ready to go."
      alternatePrompt="Already have an account?"
      alternateHref="/signin"
      alternateLabel="Sign in"
    >
      {checkingSession ? (
        <div className="signin-checking" role="status">
          <Spinner /> Checking your session…
        </div>
      ) : (
        <form className="signin-form signup-form" onSubmit={(event) => void signUp(event)}>
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
                minLength={3}
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
                autoComplete="new-password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
              />
            </Field>
            <Field>
              <FieldLabel className="confirm-password-label" htmlFor="confirm-password">
                Confirm password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your password again"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={12}
                maxLength={128}
              />
            </Field>
          </FieldGroup>

          {error && <Alert className="form-error" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <Button className="signin-submit" type="submit" disabled={submitting}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? "Creating account…" : "Create account"}
            {!submitting && <ArrowRight data-icon="inline-end" />}
          </Button>
        </form>
      )}
    </AuthPageLayout>
  );
}
