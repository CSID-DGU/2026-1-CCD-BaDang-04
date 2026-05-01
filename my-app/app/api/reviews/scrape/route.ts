import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeReviewsFromPlace } from "@/lib/review-scraper";

export const runtime = "nodejs";

function toIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})\.$/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인 후 다시 시도하세요." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { url?: string };

    if (!body.url) {
      return NextResponse.json(
        { error: "가게 정보를 가져올 링크를 입력하세요." },
        { status: 400 },
      );
    }

    const result = await scrapeReviewsFromPlace(body.url);

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .upsert(
        {
          user_id: user.id,
          source_url: result.source,
          source_platform: "kakao_place",
          place_name: result.place.placeName,
          average_rating: result.place.averageRating,
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_url" },
      )
      .select("id")
      .single();

    if (storeError || !store) {
      throw new Error(storeError?.message ?? "가게 저장에 실패했습니다.");
    }

    const storeId = store.id;

    const [deleteMenusResult, deleteReviewsResult] = await Promise.all([
      supabase.from("menus").delete().eq("store_id", storeId),
      supabase.from("reviews").delete().eq("store_id", storeId),
    ]);

    if (deleteMenusResult.error) {
      throw new Error(deleteMenusResult.error.message);
    }

    if (deleteReviewsResult.error) {
      throw new Error(deleteReviewsResult.error.message);
    }

    if (result.place.menus.length) {
      const { error: menusError } = await supabase.from("menus").insert(
        result.place.menus.map((menu, index) => ({
          store_id: storeId,
          name: menu.name,
          price_text: menu.price ?? "",
          display_order: index,
        })),
      );

      if (menusError) {
        throw new Error(menusError.message);
      }
    }

    if (result.reviews.length) {
      const { error: reviewsError } = await supabase.from("reviews").insert(
        result.reviews.map((review) => ({
          store_id: storeId,
          author: review.author ?? "",
          rating: review.rating,
          review_date: toIsoDate(review.date),
          content: review.content,
        })),
      );

      if (reviewsError) {
        throw new Error(reviewsError.message);
      }
    }

    return NextResponse.json({
      ...result,
      storage: {
        storeId,
        savedMenus: result.place.menus.length,
        savedReviews: result.reviews.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "정보 수집 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}
