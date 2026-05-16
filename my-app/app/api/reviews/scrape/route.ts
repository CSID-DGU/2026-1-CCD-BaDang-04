import { NextResponse } from "next/server";
import { createKnowledgeChunkRows } from "@/lib/embeddings";
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

    const { data: existingStores, error: existingStoresError } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id);

    if (existingStoresError) {
      throw new Error(existingStoresError.message);
    }

    const existingStoreIds = (existingStores ?? []).map((store) => store.id);

    if (existingStoreIds.length) {
      const [deleteMenusResult, deleteReviewsResult] = await Promise.all([
        supabase.from("menus").delete().in("store_id", existingStoreIds),
        supabase.from("reviews").delete().in("store_id", existingStoreIds),
      ]);

      if (deleteMenusResult.error) {
        throw new Error(deleteMenusResult.error.message);
      }

      if (deleteReviewsResult.error) {
        throw new Error(deleteReviewsResult.error.message);
      }

      const { error: deleteStoresError } = await supabase
        .from("stores")
        .delete()
        .eq("user_id", user.id);

      if (deleteStoresError) {
        throw new Error(deleteStoresError.message);
      }
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .insert({
        user_id: user.id,
        source_url: result.source,
        source_platform: "kakao_place",
        place_name: result.place.placeName,
        average_rating: result.place.averageRating,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (storeError || !store) {
      throw new Error(storeError?.message ?? "가게 저장에 실패했습니다.");
    }

    const storeId = store.id;

    const storeChunks = await createKnowledgeChunkRows([
      {
        userId: user.id,
        storeId,
        sourceKind: "store",
        sourceRecordId: storeId,
        content: [
          result.place.placeName ? `가게명: ${result.place.placeName}` : null,
          result.place.averageRating !== null
            ? `평점: ${result.place.averageRating}`
            : null,
          result.place.menus.length
            ? `대표 메뉴: ${result.place.menus
                .slice(0, 10)
                .map((menu) => `${menu.name}${menu.price ? ` ${menu.price}` : ""}`)
                .join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          sourceUrl: result.source,
          placeName: result.place.placeName,
          averageRating: result.place.averageRating,
        },
      },
    ]);

    let menuRows:
      | Array<{
          id: string;
          name: string;
          price_text: string;
        }>
      | null = null;
    if (result.place.menus.length) {
      const { data, error: menusError } = await supabase
        .from("menus")
        .insert(
          result.place.menus.map((menu, index) => ({
            store_id: storeId,
            name: menu.name,
            price_text: menu.price ?? "",
            display_order: index,
          })),
        )
        .select("id, name, price_text");

      if (menusError) {
        throw new Error(menusError.message);
      }

      menuRows = data;
    }

    let reviewRows:
      | Array<{
          id: string;
          author: string;
          rating: number | null;
          review_date: string | null;
          content: string;
        }>
      | null = null;
    if (result.reviews.length) {
      const { data, error: reviewsError } = await supabase
        .from("reviews")
        .insert(
          result.reviews.map((review) => ({
            store_id: storeId,
            author: review.author ?? "",
            rating: review.rating,
            review_date: toIsoDate(review.date),
            content: review.content,
          })),
        )
        .select("id, author, rating, review_date, content");

      if (reviewsError) {
        throw new Error(reviewsError.message);
      }

      reviewRows = data;
    }

    const menuChunks = await createKnowledgeChunkRows(
      (menuRows ?? []).map((menu) => ({
        userId: user.id,
        storeId,
        sourceKind: "menu" as const,
        sourceRecordId: menu.id,
        content: `메뉴: ${menu.name}${menu.price_text ? `\n가격: ${menu.price_text}` : ""}`,
        metadata: {
          name: menu.name,
          priceText: menu.price_text,
        },
      })),
    );

    const reviewChunks = await createKnowledgeChunkRows(
      (reviewRows ?? []).map((review) => ({
        userId: user.id,
        storeId,
        sourceKind: "review" as const,
        sourceRecordId: review.id,
        content: [
          review.author ? `작성자: ${review.author}` : null,
          review.rating !== null ? `별점: ${review.rating}` : null,
          review.review_date ? `작성일: ${review.review_date}` : null,
          `리뷰: ${review.content}`,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          author: review.author,
          rating: review.rating,
          reviewDate: review.review_date,
        },
      })),
    );

    const knowledgeChunkRows = [...storeChunks, ...menuChunks, ...reviewChunks];

    if (knowledgeChunkRows.length) {
      const { error: chunkInsertError } = await supabase
        .from("knowledge_chunks")
        .insert(
          knowledgeChunkRows.map((chunk) => ({
            user_id: chunk.userId,
            store_id: storeId,
            source_kind: chunk.sourceKind,
            source_record_id: chunk.sourceRecordId,
            content: chunk.content,
            metadata: chunk.metadata ?? {},
            embedding: chunk.embedding,
          })),
        );

      if (chunkInsertError) {
        throw new Error(chunkInsertError.message);
      }
    }

    return NextResponse.json({
      ...result,
      storage: {
        storeId,
        savedMenus: result.place.menus.length,
        savedReviews: result.reviews.length,
        savedChunks: knowledgeChunkRows.length,
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
