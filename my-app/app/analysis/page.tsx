import AppShell from "@/components/app-shell";
import { requireUser } from "@/lib/supabase/require-user";

export default async function AnalysisPage() {
  await requireUser();

  return (
    <AppShell
      title="가게 분석"
      description="리뷰 데이터를 기준으로 기간별 분석 결과를 만드는 화면입니다."
    >
      <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-12 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
        <h2 className="text-2xl font-semibold tracking-tight">준비 중입니다</h2>
        <p className="mt-3 text-sm leading-6 text-[#494954]/70">
          다음 단계에서 리뷰 기간 선택과 분석 실행 기능을 이 화면에 붙일
          예정입니다.
        </p>
      </section>
    </AppShell>
  );
}
