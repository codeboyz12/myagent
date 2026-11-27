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
    <main className="grid place-content-center justify-items-center min-h-dvh p-8 bg-background max-[560px]:p-4">
      <div className="overflow-hidden bg-background grid w-[min(940px,calc(100vw-64px))] min-h-150 grid-cols-[.92fr_1.08fr] border border-border rounded-2xl shadow-xl max-[760px]:w-[min(520px,calc(100vw-32px))] max-[760px]:min-h-auto max-[760px]:grid-cols-[1fr] max-[560px]:w-full max-[560px]:rounded-2xl">
        <section className="relative flex flex-col overflow-hidden p-8.5 bg-primary text-primary-foreground max-[760px]:min-h-60 max-[760px]:p-6 max-[560px]:min-h-51.25 max-[560px]:p-5">
          <div className="signin-brand relative z-1 flex items-center gap-2.5">
            <span className="inline-grid place-items-center w-7.5 h-7.5 flex-[0_0_30px] border border-sidebar-border rounded-md bg-sidebar-accent text-sidebar-foreground [&_svg]:w-4 [&_svg]:h-4 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_.sidebar-brand_&]:hidden in-[.signin-brand]:w-8.5 in-[.signin-brand]:h-8.5 in-[.signin-brand]:rounded-lg [.signin-brand_&_svg]:w-4.75 [.signin-brand_&_svg]:h-4.75"><Icon name="leaf" /></span>
            <span className="block text-sidebar-foreground text-[15px] font-[650] tracking-[-.035em] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-sidebar-foreground in-[.signin-brand]:text-primary-foreground">myagent</span>
          </div>
          <div className="signin-story-copy relative z-1 mt-auto mb-auto [&_h1]:m-[16px_0_13px] [&_h1]:leading-[1.13] [&_h1]:tracking-tighter [&_p]:m-0 [&_p]:leading-[1.65] max-[560px]:m-[auto_0] max-[560px]:[&_p]:max-w-75 m-[auto_0] p-[42px_0] [&_h1]:max-w-[8ch] [&_h1]:text-primary-foreground [&_h1]:text-[clamp(36px,4vw,48px)] [&_h1]:font-[560] [&_p]:max-w-[30ch] [&_p]:text-primary-foreground/80 [&_p]:text-[14px] max-[760px]:m-[auto_0] max-[760px]:p-[30px_0_12px] max-[760px]:[&_h1]:max-w-[12ch] max-[760px]:[&_h1]:text-[34px] max-[560px]:p-[24px_0_8px] max-[560px]:[&_h1]:m-[8px_0] max-[560px]:[&_h1]:text-[29px] max-[560px]:[&_p]:text-[12px]">
            <span className="text-primary-foreground/80 text-[9px] font-[650] tracking-[.14em]">A SPACE TO THINK CLEARLY</span>
            <h1>{storyHeading}</h1>
            <p>{storyDescription}</p>
          </div>
          <div className="block pointer-events-none" aria-hidden="true">
            <span className="absolute w-117.5 h-47.5 border border-border rounded-full transform-[rotate(-35deg)] -right-63.75 top-20" />
            <span className="absolute w-117.5 h-47.5 border border-border rounded-full transform-[rotate(-35deg)] -right-63.75 top-28.75" />
            <span className="absolute rounded-full bg-muted-foreground opacity-[.28] w-22.5 h-22.5 top-29 right-11.75" />
            <span className="absolute rounded-full bg-muted-foreground opacity-[.28] w-7 h-7 top-20.5 right-29.25" />
          </div>
          <div className="signin-story-footer relative z-1 flex items-center gap-2 max-[560px]:hidden text-primary-foreground/80 text-[12px] max-[760px]:hidden">
            <span className="w-1.75 h-1.75 rounded-full bg-muted-foreground ring-2 ring-ring/20 in-[.signin-story-footer]:w-1.5 in-[.signin-story-footer]:h-1.5 in-[.signin-story-footer]:shadow-[none] in-[.signin-story-footer]:bg-muted-foreground" />
            Your private AI workspace
          </div>
        </section>

        <section className="grid place-items-center p-10.5 max-[760px]:p-[34px_28px] max-[560px]:p-[28px_22px]">
          <div className="[&_h2]:m-[13px_0_6px] [&_h2]:font-semibold w-[min(360px,100%)] [&_h2]:text-foreground [&_h2]:text-[30px] [&_h2]:tracking-tighter max-[560px]:[&_h2]:text-[26px]">
            <div className="items-center gap-2.25 mb-10 text-foreground text-[16px] font-semibold tracking-[-.04em] [&_svg]:w-4.75 [&_svg]:h-4.75 [&_svg]:text-muted-foreground max-[560px]:mb-7.5 hidden"><Icon name="leaf" /><span>myagent</span></div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">{kicker}</div>
            <h2>{heading}</h2>
            <p className="m-0 text-muted-foreground text-[13px]">{description}</p>
            {children}
            <div className="[&_a]:font-semibold [&_a]:no-underline [&_a:hover]:underline mt-6.25 text-center [&_p]:m-[16px_0_0] [&_p]:text-muted-foreground [&_p]:text-[10px] [&_p]:leading-normal max-[560px]:mt-4.75 [&_a]:text-muted-foreground">
              <span className="block h-px bg-accent" />
              <p>
                {alternatePrompt} <Link href={alternateHref}>{alternateLabel}</Link>
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-6.75 text-[10px] [&_svg]:w-3.5 [&_svg]:h-3.5 max-[560px]:mt-4.75 text-muted-foreground [&_svg]:text-muted-foreground">
              <Icon name="leaf" /> Your conversations are private to your account.
            </div>
          </div>
        </section>
      </div>
      <footer className="max-[560px]:mt-3 max-[560px]:text-[7px] block text-muted-foreground text-[9px] font-semibold tracking-[.12em] max-[760px]:mt-4.5">MYAGENT · YOUR THOUGHTS, IN GOOD COMPANY</footer>
    </main>
  );
}
