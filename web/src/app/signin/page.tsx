"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthPageLayout } from "@/components/auth-page-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRight } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";

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
  const checkingSession = useAuthSession();

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
        <div className="flex items-center gap-2.25 m-[34px_0] text-muted-foreground text-[12px]" role="status">
          <Spinner /> Checking your session…
        </div>
      ) : (
        <form className="grid mt-7.5 **:data-[slot=field-group]:gap-4 **:data-[slot=field-label]:font-[550] **:data-[slot=input]:text-[12px] [&_[data-slot=input]::placeholder]:text-muted-foreground max-[560px]:mt-5.25 **:data-[slot=field-label]:text-muted-foreground **:data-[slot=field-label]:text-[12px] **:data-[slot=input]:h-11.5 **:data-[slot=input]:border-input **:data-[slot=input]:rounded-md **:data-[slot=input]:bg-background [&_[data-slot=input]:focus-visible]:border-ring [&_[data-slot=input]:focus-visible]:ring-2 [&_[data-slot=input]:focus-visible]:ring-ring/50" onSubmit={(event) => void signIn(event)}>
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
              <div className="flex items-center justify-between **:data-[slot=field-description]:pb-0 **:data-[slot=field-description]:text-muted-foreground **:data-[slot=field-description]:text-[10px]">
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

          {error && <Alert className="mt-3.25" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <Button className="w-full mt-5.5 text-[12px] h-11.5 rounded-md bg-primary text-primary-foreground [&:hover]:bg-primary" type="submit" disabled={submitting}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? "Signing in…" : "Sign in"}
            {!submitting && <ArrowRight data-icon="inline-end" />}
          </Button>
        </form>
      )}
    </AuthPageLayout>
  );
}
