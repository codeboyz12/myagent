import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">404 · PAGE NOT FOUND</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page could not be found.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The address may be incorrect, or the page may have moved.
        </p>
        <Link
          href="/chat"
          className="mt-7 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Back to chat
        </Link>
      </div>
    </main>
  );
}
