import AppShell from "@/components/app-shell";
import NewsletterGenerator from "@/components/newsletter-generator";
import NewsletterList from "@/components/newsletter-list";
import { requireUser } from "@/lib/supabase/require-user";
import { surfaceClassName } from "@/lib/ui";

type NewsletterRow = {
  id: string;
  analysis_period_start: string;
  analysis_period_end: string;
  generated_text: string;
  created_at: string;
};

export default async function ArchivePage() {
  const { supabase, user } = await requireUser();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("place_name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const { data: newsletters, error } = await supabase
    .from("newsletters")
    .select(
      "id, analysis_period_start, analysis_period_end, generated_text, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (storeError) {
    throw new Error(storeError.message);
  }

  return (
    <AppShell
      title="뉴스레터 모음"
      description="로그인한 계정으로 생성된 뉴스레터를 최신순으로 확인합니다."
    >
      <section className={`${surfaceClassName} px-7 py-6`}>
        <NewsletterGenerator placeName={store?.place_name ?? null} />
      </section>

      {!newsletters?.length ? (
        <section className={`${surfaceClassName} px-8 py-12 text-center`}>
          <h2 className="text-2xl font-semibold tracking-tight">
            저장된 뉴스레터가 없습니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#494954]/70">
            분석 결과가 생성되면 이 화면에서 기간별 뉴스레터를 확인할 수
            있습니다.
          </p>
        </section>
      ) : (
        <NewsletterList newsletters={newsletters as NewsletterRow[]} />
      )}
    </AppShell>
  );
}
