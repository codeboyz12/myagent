import type { ReactNode } from "react";
import Link from "next/link";

import { Icon } from "@/components/icon";

type AuthPageLayoutProps = {
  storyHeading: ReactNode;
  storyDescription: string;
  kicker: string;
  heading: string;
  description: string;
  children: ReactNode;
  alternatePrompt: string;
  alternateHref: string;
  alternateLabel: string;
};

export function AuthPageLayout({
  storyHeading,
  storyDescription,
  kicker,
  heading,
  description,
  children,
  alternatePrompt,
  alternateHref,
  alternateLabel,
}: AuthPageLayoutProps) {
  return (
    <main className="signin-page">
      <div className="signin-card">
        <section className="signin-story">
          <div className="signin-brand">
            <span className="brand-mark"><Icon name="leaf" /></span>
            <span className="brand-name">myagent</span>
          </div>
          <div className="signin-story-copy">
            <span className="eyebrow">A SPACE TO THINK CLEARLY</span>
            <h1>{storyHeading}</h1>
            <p>{storyDescription}</p>
          </div>
          <div className="story-decoration" aria-hidden="true">
            <span className="story-line story-line-one" />
            <span className="story-line story-line-two" />
            <span className="story-orb story-orb-one" />
            <span className="story-orb story-orb-two" />
          </div>
          <div className="signin-story-footer">
            <span className="status-indicator" />
            Your private AI workspace
          </div>
        </section>

        <section className="signin-form-panel">
          <div className="signin-form-inner">
            <div className="auth-brand"><Icon name="leaf" /><span>myagent</span></div>
            <div className="form-kicker">{kicker}</div>
            <h2>{heading}</h2>
            <p className="form-intro">{description}</p>
            {children}
            <div className="signin-provisioning">
              <span className="provisioning-rule" />
              <p>
                {alternatePrompt} <Link href={alternateHref}>{alternateLabel}</Link>
              </p>
            </div>
            <div className="signin-privacy">
              <Icon name="leaf" /> Your conversations are private to your account.
            </div>
          </div>
        </section>
      </div>
      <footer className="signin-footer">MYAGENT · YOUR THOUGHTS, IN GOOD COMPANY</footer>
    </main>
  );
}
