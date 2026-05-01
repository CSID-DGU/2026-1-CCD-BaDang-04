"use client";

import { FormEvent, useState } from "react";
import type {
  ScrapedMenu,
  ScrapedPlaceInfo,
  ScrapedReview,
} from "@/lib/review-scraper";

type ScrapeResponse = {
  source: string;
  place: ScrapedPlaceInfo;
  reviews: ScrapedReview[];
  note?: string;
  storage?: {
    storeId: string;
    savedMenus: number;
    savedReviews: number;
  };
};

function isErrorResponse(
  data: ScrapeResponse | { error?: string },
): data is { error?: string } {
  return !("reviews" in data);
}

export default function ReviewImportForm() {
  const [url, setUrl] = useState("");
  const [place, setPlace] = useState<ScrapedPlaceInfo | null>(null);
  const [reviews, setReviews] = useState<ScrapedReview[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetResultsWithError(message: string) {
    setPlace(null);
    setReviews([]);
    setErrorMessage(message);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setNotice("");

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/reviews/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as
        | ScrapeResponse
        | { error?: string };

      if (!response.ok) {
        resetResultsWithError(
          isErrorResponse(data)
            ? data.error ?? "정보 수집에 실패했습니다."
            : "정보 수집에 실패했습니다.",
        );
        return;
      }

      if (isErrorResponse(data)) {
        resetResultsWithError(data.error ?? "정보 수집에 실패했습니다.");
        return;
      }

      setPlace(data.place);
      setReviews(data.reviews);
      setNotice(
        data.storage
          ? `저장 완료: 메뉴 ${data.storage.savedMenus}개, 리뷰 ${data.storage.savedReviews}개`
          : data.note ??
            `메뉴 ${data.place.menus.length}개, 리뷰 ${data.reviews.length}개를 가져왔습니다.`,
      );
    } catch {
      resetResultsWithError("정보 수집 요청을 보내지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-8 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            가게 정보 가져오기
          </h2>
          <p className="text-sm leading-6 text-[#494954]/70">
            카카오맵 장소 링크를 넣으면 Playwright로 페이지를 열어 가게 기본
            정보, 메뉴, 리뷰 추출을 시도합니다.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[#494954]">
              리뷰 링크
            </span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://place.map.kakao.com/..."
              required
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-[#494954] outline-none transition placeholder:text-[#494954]/40 focus:border-stone-400 focus:bg-white"
            />
          </label>

          {errorMessage ? (
            <p className="text-sm leading-6 text-[#d84c3e]">{errorMessage}</p>
          ) : null}

          {notice ? (
            <p className="text-sm leading-6 text-[#4f7cf7]">{notice}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 items-center justify-center rounded-2xl bg-[#759AFC] px-5 text-sm font-medium text-white transition hover:bg-[#5f86ef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "정보 수집 중..." : "정보 가져오기"}
          </button>
        </form>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-8 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">가게 정보</h2>
          <p className="text-sm leading-6 text-[#494954]/70">
            레포트 생성에 쓸 기본 정보와 메뉴 요약입니다.
          </p>
        </div>

        {!place ? (
          <div className="mt-6 rounded-2xl bg-[#f7f3ee] px-5 py-6 text-sm leading-6 text-[#494954]/70">
            아직 가져온 가게 정보가 없습니다.
          </div>
        ) : (
          <div className="mt-6 grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#f7f3ee] px-5 py-4">
                <div className="text-sm text-[#494954]/60">가게명</div>
                <div className="mt-2 text-base font-medium text-[#494954]">
                  {place.placeName ?? "없음"}
                </div>
              </div>
              <div className="rounded-2xl bg-[#f7f3ee] px-5 py-4">
                <div className="text-sm text-[#494954]/60">평점</div>
                <div className="mt-2 text-base font-medium text-[#494954]">
                  {place.averageRating ?? "없음"}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold tracking-tight">메뉴</h3>
                <span className="rounded-full bg-[#f4efe8] px-4 py-2 text-sm font-medium text-[#494954]">
                  {place.menus.length}개
                </span>
              </div>

              {!place.menus.length ? (
                <div className="mt-4 rounded-2xl bg-[#f7f3ee] px-5 py-6 text-sm leading-6 text-[#494954]/70">
                  추출된 메뉴가 없습니다.
                </div>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {place.menus.map((menu: ScrapedMenu, index) => (
                    <li
                      key={`${index}-${menu.name}`}
                      className="flex items-center justify-between rounded-2xl bg-[#f7f3ee] px-5 py-4 text-sm text-[#494954]"
                    >
                      <span className="font-medium">{menu.name}</span>
                      <span className="text-[#494954]/70">
                        {menu.price ?? "가격 없음"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 px-8 py-8 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">추출 결과</h2>
            <p className="text-sm leading-6 text-[#494954]/70">
              가져온 리뷰는 아직 저장하지 않고 화면에만 표시합니다.
            </p>
          </div>
          <span className="rounded-full bg-[#f4efe8] px-4 py-2 text-sm font-medium text-[#494954]">
            {reviews.length}건
          </span>
        </div>

        {!reviews.length ? (
          <div className="mt-6 rounded-2xl bg-[#f7f3ee] px-5 py-6 text-sm leading-6 text-[#494954]/70">
            아직 추출된 리뷰가 없습니다.
          </div>
        ) : (
          <ol className="mt-6 grid gap-3">
            {reviews.map((review, index) => (
              <li
                key={`${index}-${review.author ?? "review"}-${review.date ?? "unknown"}`}
                className="rounded-2xl bg-[#f7f3ee] px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-3 text-sm text-[#494954]/70">
                  <span className="font-medium text-[#494954]">
                    {review.author ?? "작성자 없음"}
                  </span>
                  {review.rating !== null ? <span>별점 {review.rating}</span> : null}
                  {review.date ? <span>작성일 {review.date}</span> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#494954]">
                  {review.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
