import AppShell from "@/components/app-shell";
import AnalysisDashboard from "@/components/analysis-dashboard";
import { requireUser } from "@/lib/supabase/require-user";

export default async function AnalysisPage() {
  const { supabase } = await requireUser();

  const [{ data: stores, error: storesError }, { data: reviews, error: reviewsError }] =
    await Promise.all([
      supabase
        .from("stores")
        .select("id, place_name, average_rating, menus(name)")
        .order("updated_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("id, store_id, author, rating, review_date, content"),
    ]);

  if (storesError) {
    throw new Error(storesError.message);
  }

  if (reviewsError) {
    throw new Error(reviewsError.message);
  }

  const normalizedStores =
    stores?.map((store) => ({
      id: store.id,
      placeName: store.place_name,
      averageRating: store.average_rating,
      menus:
        store.menus?.map((menu) => ({
          name: menu.name,
        })) ?? [],
    })) ?? [];

  const normalizedReviews =
    reviews?.map((review) => ({
      id: review.id,
      storeId: review.store_id,
      author: review.author,
      rating: review.rating,
      reviewDate: review.review_date,
      content: review.content,
    })) ?? [];

  return (
    <AppShell
      title="분석 대시보드"
      description="가게별 리뷰 데이터를 기간 단위로 비교해서 장점, 단점, 감성 비중과 주요 이슈를 확인합니다."
    >
      <AnalysisDashboard stores={normalizedStores} reviews={normalizedReviews} />
    </AppShell>
  );
}
