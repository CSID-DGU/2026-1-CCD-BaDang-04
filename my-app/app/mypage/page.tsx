import AppShell from "@/components/app-shell";
import { requireUser } from "@/lib/supabase/require-user";

export default async function MyPage() {
  const { user } = await requireUser();

  return (
    <AppShell
      title="마이페이지"
      description="계정 정보와 기본 설정을 확인하는 화면입니다."
    >
      <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-8 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            계정 정보
          </h2>
          <p className="text-sm leading-6 text-[#494954]/70">
            현재 로그인한 사용자 정보를 표시합니다.
          </p>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#f7f3ee] px-5 py-4">
            <dt className="text-sm font-medium text-[#494954]/60">이메일</dt>
            <dd className="mt-2 text-base font-medium text-[#494954]">
              {user.email ?? "이메일 없음"}
            </dd>
          </div>
          <div className="rounded-2xl bg-[#f7f3ee] px-5 py-4">
            <dt className="text-sm font-medium text-[#494954]/60">사용자 ID</dt>
            <dd className="mt-2 break-all text-base font-medium text-[#494954]">
              {user.id}
            </dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
