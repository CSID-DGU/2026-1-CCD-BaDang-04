"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/analysis", label: "가게 분석" },
  { href: "/archive", label: "뉴스레터 모음" },
  { href: "/mypage", label: "마이페이지" },
];

export default function TopTabs() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-3 gap-2 rounded-[24px] bg-[#f4efe8] p-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex h-12 items-center justify-center rounded-2xl text-sm font-medium transition ${
              isActive
                ? "bg-[#759AFC] text-white shadow-[0_10px_24px_rgba(117,154,252,0.28)]"
                : "text-[#494954] hover:bg-white/70"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
