import AppShell from "@/components/app-shell";
import { requireUser } from "@/lib/supabase/require-user";

type NewsletterRow = {
  id: string;
  analysis_period_start: string;
  analysis_period_end: string;
  generated_text: string;
  created_at: string;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(dateString: string) {
  return dateFormatter.format(new Date(dateString));
}

export default async function ArchivePage() {
  const { supabase } = await requireUser();

  const { data: newsletters, error } = await supabase
    .from("newsletters")
    .select(
      "id, analysis_period_start, analysis_period_end, generated_text, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <AppShell
      title="뉴스레터 모음"
      description="로그인한 계정으로 생성된 뉴스레터를 최신순으로 확인합니다."
    >
      {!newsletters?.length ? (
        <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-12 text-center shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
          <h2 className="text-2xl font-semibold tracking-tight">
            저장된 뉴스레터가 없습니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#494954]/70">
            분석 결과가 생성되면 이 화면에서 기간별 뉴스레터를 확인할 수
            있습니다.
          </p>
        </section>
      ) : (
        <section className="grid gap-4">
          {(newsletters as NewsletterRow[]).map((newsletter) => (
            <article
              key={newsletter.id}
              className="rounded-[28px] border border-white/70 bg-white/80 px-7 py-6 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#759AFC]">
                    {formatDate(newsletter.analysis_period_start)} -{" "}
                    {formatDate(newsletter.analysis_period_end)}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-[#494954]">
                    {formatDate(newsletter.created_at)} 생성 뉴스레터
                  </h2>
                </div>
                <span className="text-sm text-[#494954]/60">
                  {formatDate(newsletter.created_at)}
                </span>
              </div>

              <p className="mt-5 line-clamp-3 text-base leading-7 text-[#494954]/82">
                {newsletter.generated_text}
              </p>
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}
