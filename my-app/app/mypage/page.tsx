import AppShell from "@/components/app-shell";
import ReviewImportForm from "@/components/review-import-form";
import { formatShortDate } from "@/lib/date-format";
import { isDisplayableReviewContent } from "@/lib/review-scraper";
import { requireUser } from "@/lib/supabase/require-user";
import { mutedPanelClassName, surfaceClassName } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const { supabase, user } = await requireUser();

  const { data: store, error } = await supabase
    .from("stores")
    .select("id, place_name, average_rating, source_url, last_scraped_at")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const menus = store
    ? (
        await supabase
          .from("menus")
          .select("name, price_text")
          .eq("store_id", store.id)
          .order("display_order", { ascending: true })
      ).data ?? []
    : [];

  const storedReviews = store
    ? (
        await supabase
          .from("reviews")
          .select("author, rating, review_date, content")
          .eq("store_id", store.id)
          .order("review_date", { ascending: false })
      ).data ?? []
    : [];

  const initialPlace = store
    ? {
        placeName: store.place_name,
        averageRating: store.average_rating,
        menus: menus.map((menu) => ({
          name: menu.name,
          price: menu.price_text,
        })),
      }
    : null;

  const initialReviews = storedReviews
    .filter((review) => isDisplayableReviewContent(review.content))
    .map((review) => ({
      author: review.author,
      rating: review.rating,
      date: review.review_date
        ? `${review.review_date.replace(/-/g, ".")}.`
        : null,
      content: review.content,
    }));

  return (
    <AppShell
      title="마이페이지"
      description="계정 정보와 내가 불러온 가게 원본 데이터를 관리하는 화면입니다."
    >
      <div className="grid gap-6">
        <section className={`${surfaceClassName} px-8 py-8`}>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">계정 정보</h2>
            <p className="text-sm leading-6 text-[#494954]/70">
              현재 로그인한 사용자 정보를 표시합니다.
            </p>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className={`${mutedPanelClassName} px-5 py-4`}>
              <dt className="text-sm font-medium text-[#494954]/60">이메일</dt>
              <dd className="mt-2 text-base font-medium text-[#494954]">
                {user.email ?? "이메일 없음"}
              </dd>
            </div>
            <div className={`${mutedPanelClassName} px-5 py-4`}>
              <dt className="text-sm font-medium text-[#494954]/60">사용자 ID</dt>
              <dd className="mt-2 break-all text-base font-medium text-[#494954]">
                {user.id}
              </dd>
            </div>
          </dl>
        </section>

        <section className={`${surfaceClassName} px-8 py-8`}>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              내 가게 데이터
            </h2>
            <p className="text-sm leading-6 text-[#494954]/70">
              불러온 가게의 원본 데이터 현황입니다. 분석 대시보드는 이 데이터를
              기준으로 동작합니다.
            </p>
          </div>

          {!store ? (
            <div
              className={`${mutedPanelClassName} mt-6 px-5 py-6 text-sm leading-6 text-[#494954]/70`}
            >
              아직 불러온 가게 데이터가 없습니다.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <article className={`${mutedPanelClassName} px-5 py-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-[#494954]">
                      {store.place_name ?? "이름 없는 가게"}
                    </h3>
                    <p className="break-all text-sm leading-6 text-[#494954]/68">
                      {store.source_url}
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#494954]">
                    평점 {store.average_rating ?? "-"}
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <dt className="text-xs text-[#494954]/60">평점</dt>
                    <dd className="mt-2 text-xl font-semibold text-[#494954]">
                      {store.average_rating ?? "-"}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <dt className="text-xs text-[#494954]/60">리뷰 수</dt>
                    <dd className="mt-2 text-xl font-semibold text-[#494954]">
                      {storedReviews.length}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <dt className="text-xs text-[#494954]/60">최근 수집</dt>
                    <dd className="mt-2 text-sm font-medium text-[#494954]">
                      {store.last_scraped_at
                        ? formatShortDate(store.last_scraped_at)
                        : "기록 없음"}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          )}
        </section>

        <ReviewImportForm
          initialPlace={initialPlace}
          initialReviews={initialReviews}
        />
      </div>
    </AppShell>
  );
}
