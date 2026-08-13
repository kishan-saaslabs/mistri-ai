import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      <ThemeToggle className="absolute top-4 right-4 size-8" />
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px] text-center">
          <div className="mx-auto mb-[18px] flex size-[46px] items-center justify-center rounded-[10px] bg-foreground text-base font-bold text-background">
            M
          </div>
          <h1 className="mb-2 text-xl font-semibold">{title}</h1>
          <p className="mx-auto mb-[26px] max-w-[40ch] text-[13.5px] text-muted-foreground">
            {subtitle}
          </p>

          <div className="text-left">{children}</div>

          <div className="mt-5 text-[12.5px] text-muted-foreground">{footer}</div>
        </div>
      </div>

      <div className="pb-5 text-center font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Open-source · MIT licensed
      </div>
    </div>
  );
}
