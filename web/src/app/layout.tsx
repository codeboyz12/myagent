import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "myagent — your AI workspace",
  description: "A private workspace for your questions, projects, and conversations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-openui-theme="light" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('myagent-theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.dataset.openuiTheme='dark'}}catch{}` }} /></head>
      <body className="m-0 min-h-full bg-background text-foreground text-sm antialiased font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
