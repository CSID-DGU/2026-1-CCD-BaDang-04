import Image from "next/image";
import TopTabs from "@/components/top-tabs";
import { surfaceClassName } from "@/lib/ui";

type AppShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export default function AppShell({
  title,
  description,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-10 text-[#494954]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className={`${surfaceClassName} px-6 py-6 sm:px-8 sm:py-7`}>
          <div className="space-y-3">
            <Image
              src="/logo.svg"
              alt="BaDang logo"
              width={132}
              height={44}
              style={{ width: "auto", height: "44px" }}
            />
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-[#494954]/70">{description}</p>
          </div>

          <div className="mt-6">
            <TopTabs />
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
