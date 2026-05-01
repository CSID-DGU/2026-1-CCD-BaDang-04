import AppShell from "@/components/app-shell";
import ReviewImportForm from "@/components/review-import-form";
import { requireUser } from "@/lib/supabase/require-user";

export default async function AnalysisPage() {
  await requireUser();

  return (
    <AppShell
      title="가게 분석"
      description="리뷰 데이터를 기준으로 기간별 분석 결과를 만드는 화면입니다."
    >
      <ReviewImportForm />
    </AppShell>
  );
}
