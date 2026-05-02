"use client";

import { useMemo, useState } from "react";
import { formatShortDate } from "@/lib/date-format";
import {
  classNames,
  dashboardSurfaceClassName,
  mutedPanelClassName,
} from "@/lib/ui";

type StoreOption = {
  id: string;
  placeName: string | null;
  averageRating: number | null;
  menus: Array<{ name: string }>;
};

type ReviewRow = {
  id: string;
  storeId: string;
  author: string | null;
  rating: number | null;
  reviewDate: string | null;
  content: string;
};

type DashboardProps = {
  stores: StoreOption[];
  reviews: ReviewRow[];
};

type Sentiment = "positive" | "negative" | "neutral";

type IssueInsight = {
  title: string;
  count: number;
  recommendation: string;
};

const periodOptions = [
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "90d", label: "최근 90일", days: 90 },
  { key: "all", label: "전체", days: null },
] as const;

const positiveTerms = [
  "맛있",
  "친절",
  "좋",
  "깔끔",
  "빠르",
  "넓",
  "추천",
  "만족",
  "괜찮",
  "최고",
  "가성비",
  "좋아",
];

const negativeTerms = [
  "별로",
  "불친절",
  "느리",
  "아쉽",
  "시끄럽",
  "지저분",
  "더럽",
  "최악",
  "불편",
  "오래",
  "문제",
  "허탕",
  "탄맛",
];

const issueRules = [
  {
    title: "서비스 응대",
    keywords: ["불친절", "응대", "직원", "서비스", "표정"],
    recommendation:
      "피크 타임 응대 스크립트와 테이블 응대 기준을 짧게 재정리하는 편이 좋습니다.",
  },
  {
    title: "대기와 주문 흐름",
    keywords: ["대기", "줄", "키오스크", "오래", "느리", "주문"],
    recommendation:
      "주문 병목 구간을 분리해서 키오스크 안내와 카운터 보조 동선을 같이 점검해야 합니다.",
  },
  {
    title: "매장 환경",
    keywords: ["시끄럽", "정신없", "자리", "청소", "더럽", "지저분"],
    recommendation:
      "혼잡 시간대 청결 점검 주기와 좌석 회전 동선을 분리해서 관리하는 편이 효과적입니다.",
  },
  {
    title: "맛과 품질",
    keywords: ["맛", "탄맛", "패티", "식감", "눅눅", "차갑"],
    recommendation:
      "메뉴별 품질 편차가 지적되는 시간대와 조리 공정을 같이 확인해야 합니다.",
  },
];

const stopWords = new Set([
  "그리고",
  "그냥",
  "너무",
  "정말",
  "조금",
  "여기",
  "거기",
  "이번",
  "이곳",
  "가게",
  "매장",
  "방문",
  "분위기",
  "친절",
  "가성비",
  "맛",
  "메뉴",
  "주문",
  "좋아요",
  "좋음",
  "있어요",
  "없어요",
  "합니다",
  "같아요",
  "입니다",
  "했어요",
  "해요",
  "에서",
  "으로",
  "정도",
  "진짜",
  "항상",
  "외국인",
]);

function scoreReview(content: string, rating: number | null): number {
  const normalized = content.toLowerCase();
  let score = 0;

  positiveTerms.forEach((term) => {
    if (normalized.includes(term)) {
      score += 1;
    }
  });

  negativeTerms.forEach((term) => {
    if (normalized.includes(term)) {
      score -= 1;
    }
  });

  if (rating !== null) {
    if (rating >= 4) {
      score += 1;
    } else if (rating <= 2) {
      score -= 1;
    }
  }

  return score;
}

function classifySentiment(content: string, rating: number | null): Sentiment {
  const score = scoreReview(content, rating);

  if (score >= 1) {
    return "positive";
  }

  if (score <= -1) {
    return "negative";
  }

  return "neutral";
}

function formatReviewDate(reviewDate: string | null) {
  if (!reviewDate) {
    return "작성일 없음";
  }

  return formatShortDate(reviewDate);
}

function buildKeywordCounts(reviews: ReviewRow[], menus: StoreOption["menus"]) {
  const counts = new Map<string, number>();
  const menuNames = menus
    .map((menu) => menu.name.trim())
    .filter((name) => name.length >= 2);

  reviews.forEach((review) => {
    menuNames.forEach((menuName) => {
      if (review.content.includes(menuName)) {
        counts.set(menuName, (counts.get(menuName) ?? 0) + 2);
      }
    });

    const tokens = review.content.match(/[가-힣]{2,}/g) ?? [];
    tokens.forEach((token) => {
      if (stopWords.has(token)) {
        return;
      }

      counts.set(token, (counts.get(token) ?? 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ keyword, count }));
}

function buildSummaryPoints(reviews: ReviewRow[], sentiment: Sentiment) {
  return reviews
    .filter((review) => classifySentiment(review.content, review.rating) === sentiment)
    .sort((left, right) => scoreReview(right.content, right.rating) - scoreReview(left.content, left.rating))
    .slice(0, 3)
    .map((review) => ({
      title:
        sentiment === "positive"
          ? review.content.slice(0, 48)
          : review.content.slice(0, 52),
      supportingText: `${review.author ?? "익명"} · ${formatReviewDate(review.reviewDate)}`,
    }));
}

function buildIssues(reviews: ReviewRow[]): IssueInsight[] {
  return issueRules
    .map((rule) => {
      const count = reviews.filter((review) =>
        rule.keywords.some((keyword) => review.content.includes(keyword)),
      ).length;

      return {
        title: rule.title,
        count,
        recommendation: rule.recommendation,
      };
    })
    .filter((issue) => issue.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);
}

function buildDonutStyle(
  positiveCount: number,
  neutralCount: number,
  negativeCount: number,
) {
  const total = positiveCount + neutralCount + negativeCount;

  if (!total) {
    return {
      background:
        "conic-gradient(#d8d8de 0deg 360deg, #d8d8de 360deg 360deg)",
    };
  }

  const positiveAngle = (positiveCount / total) * 360;
  const neutralAngle = (neutralCount / total) * 360;
  const negativeAngle = 360 - positiveAngle - neutralAngle;

  return {
    background: `conic-gradient(#759AFC 0deg ${positiveAngle}deg, #d7b87b ${positiveAngle}deg ${positiveAngle + neutralAngle}deg, #eb7f63 ${positiveAngle + neutralAngle}deg ${positiveAngle + neutralAngle + negativeAngle}deg)`,
  };
}

function getPeriodCutoff(days: number | null) {
  if (!days) {
    return null;
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

export default function AnalysisDashboard({
  stores,
  reviews,
}: DashboardProps) {
  const [selectedPeriod, setSelectedPeriod] =
    useState<(typeof periodOptions)[number]["key"]>("30d");

  const selectedStore = stores[0] ?? null;

  const filteredReviews = useMemo(() => {
    if (!selectedStore) {
      return [];
    }

    const cutoff = getPeriodCutoff(
      periodOptions.find((option) => option.key === selectedPeriod)?.days ?? null,
    );

    return reviews.filter((review) => {
      if (review.storeId !== selectedStore.id) {
        return false;
      }

      if (!cutoff) {
        return true;
      }

      if (!review.reviewDate) {
        return false;
      }

      return new Date(review.reviewDate) >= cutoff;
    });
  }, [reviews, selectedPeriod, selectedStore]);

  const stats = useMemo(() => {
    const positive = filteredReviews.filter(
      (review) => classifySentiment(review.content, review.rating) === "positive",
    );
    const negative = filteredReviews.filter(
      (review) => classifySentiment(review.content, review.rating) === "negative",
    );
    const neutral = filteredReviews.filter(
      (review) => classifySentiment(review.content, review.rating) === "neutral",
    );

    return {
      positiveCount: positive.length,
      negativeCount: negative.length,
      neutralCount: neutral.length,
      strengths: buildSummaryPoints(filteredReviews, "positive"),
      weaknesses: buildSummaryPoints(filteredReviews, "negative"),
      keywords: buildKeywordCounts(filteredReviews, selectedStore?.menus ?? []),
      issues: buildIssues(negative),
    };
  }, [filteredReviews, selectedStore]);

  if (!stores.length) {
    return (
      <section className={`${dashboardSurfaceClassName} px-8 py-12`}>
        <h2 className="text-2xl font-semibold tracking-tight">
          분석할 가게가 없습니다
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#494954]/70">
          마이페이지에서 카카오맵 링크로 가게 데이터를 먼저 불러오면 이
          대시보드에서 기간별 분석을 볼 수 있습니다.
        </p>
      </section>
    );
  }

  const totalCount =
    stats.positiveCount + stats.neutralCount + stats.negativeCount;

  return (
    <div className="grid gap-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#494954]">
            {selectedStore?.placeName ?? "이름 없는 가게"}의 리뷰 분석
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#494954]/70">
            저장된 리뷰를 기준으로 기간별 장점, 단점, 감성 비중과 주요 이슈를
            정리합니다.
          </p>
        </div>
        <div className="rounded-[20px] border border-stone-200/70 bg-[#ece5dc] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:min-w-[360px]">
            {periodOptions.map((option) => {
              const isActive = selectedPeriod === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedPeriod(option.key)}
                  className={classNames(
                    "min-h-11 rounded-2xl px-3 py-2 text-sm font-medium leading-tight transition",
                    isActive
                      ? "bg-[#759AFC] text-white shadow-[0_10px_24px_rgba(117,154,252,0.24)]"
                      : "text-[#494954] hover:bg-white/80",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {!filteredReviews.length ? (
        <section className={`${dashboardSurfaceClassName} px-8 py-12`}>
          <h2 className="text-2xl font-semibold tracking-tight">
            선택한 기간에 분석할 리뷰가 없습니다
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#494954]/70">
            기간을 넓히거나 마이페이지에서 가게 데이터를 다시 불러오면
            대시보드가 채워집니다.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className={`${dashboardSurfaceClassName} px-6 py-6`}>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-tight">장점 요약</h2>
                <span className="rounded-full bg-[#edf2ff] px-3 py-1.5 text-xs font-medium text-[#5f7fe8]">
                  긍정 {stats.positiveCount}건
                </span>
              </div>
              <ul className="mt-5 grid gap-3">
                {stats.strengths.length ? (
                  stats.strengths.map((item) => (
                    <li
                      key={`${item.title}-${item.supportingText}`}
                      className={`${mutedPanelClassName} px-5 py-4`}
                    >
                      <p className="text-sm font-medium leading-6 text-[#494954]">
                        {item.title}
                      </p>
                      <p className="mt-2 text-xs text-[#494954]/60">
                        {item.supportingText}
                      </p>
                    </li>
                  ))
                ) : (
                  <li
                    className={`${mutedPanelClassName} px-5 py-4 text-sm text-[#494954]/70`}
                  >
                    뚜렷한 긍정 패턴이 아직 충분하지 않습니다.
                  </li>
                )}
              </ul>
            </div>

            <div className={`${dashboardSurfaceClassName} px-6 py-6`}>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-tight">단점 요약</h2>
                <span className="rounded-full bg-[#fff0eb] px-3 py-1.5 text-xs font-medium text-[#dc765b]">
                  부정 {stats.negativeCount}건
                </span>
              </div>
              <ul className="mt-5 grid gap-3">
                {stats.weaknesses.length ? (
                  stats.weaknesses.map((item) => (
                    <li
                      key={`${item.title}-${item.supportingText}`}
                      className={`${mutedPanelClassName} px-5 py-4`}
                    >
                      <p className="text-sm font-medium leading-6 text-[#494954]">
                        {item.title}
                      </p>
                      <p className="mt-2 text-xs text-[#494954]/60">
                        {item.supportingText}
                      </p>
                    </li>
                  ))
                ) : (
                  <li
                    className={`${mutedPanelClassName} px-5 py-4 text-sm text-[#494954]/70`}
                  >
                    뚜렷한 부정 패턴이 아직 충분하지 않습니다.
                  </li>
                )}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className={`${dashboardSurfaceClassName} px-6 py-6`}>
              <h2 className="text-xl font-semibold tracking-tight">
                긍정 / 중립 / 부정 비중
              </h2>
              <div className="mt-6 grid items-center gap-8 lg:grid-cols-[280px_1fr]">
                <div className="mx-auto flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#f4efe8]">
                  <div
                    style={buildDonutStyle(
                      stats.positiveCount,
                      stats.neutralCount,
                      stats.negativeCount,
                    )}
                    className="relative flex h-[228px] w-[228px] items-center justify-center rounded-full"
                  >
                    <div className="flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full bg-white text-[#494954]">
                      <span className="text-[11px] text-[#494954]/60">리뷰 수</span>
                      <span className="mt-1 text-3xl font-semibold">{totalCount}</span>
                    </div>
                  </div>
                </div>

                <ul className="grid gap-3">
                  {[
                    {
                      label: "긍정",
                      color: "bg-[#759AFC]",
                      count: stats.positiveCount,
                    },
                    {
                      label: "중립",
                      color: "bg-[#d7b87b]",
                      count: stats.neutralCount,
                    },
                    {
                      label: "부정",
                      color: "bg-[#eb7f63]",
                      count: stats.negativeCount,
                    },
                  ].map((item) => (
                    <li
                      key={item.label}
                      className={`${mutedPanelClassName} flex items-center justify-between px-4 py-3`}
                    >
                      <div className="flex items-center gap-3 text-sm font-medium text-[#494954]">
                        <span className={`h-3 w-3 rounded-full ${item.color}`} />
                        {item.label}
                      </div>
                      <span className="text-sm text-[#494954]/70">{item.count}건</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`${dashboardSurfaceClassName} px-6 py-6`}>
              <h2 className="text-xl font-semibold tracking-tight">대표 키워드 분석</h2>
              <div className="mt-5 flex flex-wrap gap-2">
                {stats.keywords.length ? (
                  stats.keywords.map((item) => (
                    <div
                      key={item.keyword}
                      className="rounded-full bg-[#f4efe8] px-4 py-2 text-sm text-[#494954]"
                    >
                      {item.keyword}
                      <span className="ml-2 text-[#494954]/55">{item.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#494954]/70">
                    키워드를 추출할 데이터가 아직 충분하지 않습니다.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className={`${dashboardSurfaceClassName} px-6 py-6`}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">문제점 및 해결 방향</h2>
              <span className="rounded-full bg-[#f4efe8] px-3 py-1.5 text-xs font-medium text-[#494954]">
                우선순위 {stats.issues.length}개
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {stats.issues.length ? (
                stats.issues.map((issue) => (
                  <article
                    key={issue.title}
                    className={`${mutedPanelClassName} px-5 py-5`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-[#494954]">
                        {issue.title}
                      </h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#dc765b]">
                        {issue.count}건
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#494954]/72">
                      {issue.recommendation}
                    </p>
                  </article>
                ))
              ) : (
                <div
                  className={`${mutedPanelClassName} px-5 py-5 text-sm leading-6 text-[#494954]/70 lg:col-span-3`}
                >
                  현재 기간에는 명확한 문제 패턴이 크지 않습니다. 다음 단계로는
                  기간별 추세 변화와 메뉴별 언급량을 함께 보는 구성이 더 좋습니다.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
