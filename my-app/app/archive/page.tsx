import AppShell from "@/components/app-shell";
import Link from "next/link";
import { formatFullDate } from "@/lib/date-format";
import { requireUser } from "@/lib/supabase/require-user";
import { primaryButtonClassName, surfaceClassName } from "@/lib/ui";

type NewsletterRow = {
  id: string;
  analysis_period_start: string;
  analysis_period_end: string;
  generated_text: string;
  created_at: string;
};

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
      <section
        className={`${surfaceClassName} flex flex-col gap-4 px-7 py-6 sm:flex-row sm:items-center sm:justify-between`}
      >
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[#494954]">
            생성된 뉴스레터
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#494954]/70">
            이전에 만든 뉴스레터를 다시 보고, 새 분석으로 다음 뉴스레터를
            생성할 수 있습니다.
          </p>
        </div>
        <Link
          href="/analysis"
          className={`${primaryButtonClassName} h-11 shrink-0 px-5`}
        >
          새 뉴스레터 생성
        </Link>
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
          <div className="mt-6 flex justify-center">
            <Link
              href="/analysis"
              className={`${primaryButtonClassName} h-11 px-5`}
            >
              첫 뉴스레터 생성하기
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          {(newsletters as NewsletterRow[]).map((newsletter) => (
            <article
              key={newsletter.id}
              className={`${surfaceClassName} px-7 py-6`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#759AFC]">
                    {formatFullDate(newsletter.analysis_period_start)} -{" "}
                    {formatFullDate(newsletter.analysis_period_end)}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-[#494954]">
                    {formatFullDate(newsletter.created_at)} 생성 뉴스레터
                  </h2>
                </div>
                <span className="text-sm text-[#494954]/60">
                  {formatFullDate(newsletter.created_at)}
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
