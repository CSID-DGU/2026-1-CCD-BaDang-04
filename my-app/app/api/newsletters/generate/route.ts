import { NextResponse } from "next/server";
import { createEmbeddingVector } from "@/lib/embeddings";
import { formatFullDate } from "@/lib/date-format";
import { getAnalysisModel, getOpenAiApiKey } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const periodOptions = [
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "90d", label: "최근 90일", days: 90 },
  { key: "all", label: "전체", days: null },
] as const;

type KnowledgeChunkMatch = {
  source_kind: "store" | "menu" | "review";
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

type NewsletterPayload = {
  headline: string;
  summary: string;
  insights: string[];
  actions: string[];
  closing: string;
};

function getPeriodLabel(periodKey: string) {
  return periodOptions.find((option) => option.key === periodKey)?.label ?? "전체";
}

function getPeriodCutoff(periodKey: string) {
  const days =
    periodOptions.find((option) => option.key === periodKey)?.days ?? null;

  if (!days) {
    return null;
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function withinPeriod(chunk: KnowledgeChunkMatch, cutoff: Date | null) {
  if (!cutoff || chunk.source_kind !== "review") {
    return true;
  }

  const reviewDate = chunk.metadata?.reviewDate;

  if (typeof reviewDate !== "string") {
    return false;
  }

  return new Date(reviewDate) >= cutoff;
}

function stringifyContext(chunks: KnowledgeChunkMatch[]) {
  return chunks.map((chunk) => `- [${chunk.source_kind}] ${chunk.content}`).join("\n");
}

function buildNewsletterText(input: {
  periodStart: string;
  periodEnd: string;
  keyword: string;
  payload: NewsletterPayload;
}) {
  return [
    input.payload.headline,
    "",
    `분석 기간: ${formatFullDate(input.periodStart)} - ${formatFullDate(input.periodEnd)}`,
    `핵심 키워드: ${input.keyword}`,
    "",
    input.payload.summary,
    "",
    "[핵심 인사이트]",
    ...input.payload.insights.map((item, index) => `${index + 1}. ${item}`),
    "",
    "[실행 제안]",
    ...input.payload.actions.map((item, index) => `${index + 1}. ${item}`),
    "",
    input.payload.closing,
  ].join("\n");
}

async function generateNewsletter(input: {
  placeName: string;
  keyword: string;
  periodLabel: string;
  reviewCount: number;
  context: string;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getAnalysisModel(),
      messages: [
        {
          role: "system",
          content:
            "너는 소상공인 마케팅 뉴스레터를 작성하는 에디터다. 반드시 한국어 JSON만 반환하고, 리뷰 근거를 과장 없이 해석해서 실행 가능한 인사이트로 정리한다.",
        },
        {
          role: "user",
          content: [
            `${input.placeName}의 ${input.periodLabel} 데이터로 AI 뉴스레터를 만든다.`,
            `핵심 키워드: ${input.keyword}`,
            `검토 대상 리뷰 수: ${input.reviewCount}`,
            "",
            "[RAG 컨텍스트]",
            input.context || "- 관련 컨텍스트 없음",
            "",
            "다음 JSON 스키마로만 응답한다.",
            `{
  "headline": "string",
  "summary": "string",
  "insights": ["string"],
  "actions": ["string"],
  "closing": "string"
}`,
            "headline은 제목 한 줄, summary는 2~3문장 요약, insights는 최대 4개, actions는 최대 3개로 작성한다.",
          ].join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "newsletter_generation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              headline: { type: "string" },
              summary: { type: "string" },
              insights: {
                type: "array",
                items: { type: "string" },
              },
              actions: {
                type: "array",
                items: { type: "string" },
              },
              closing: { type: "string" },
            },
            required: ["headline", "summary", "insights", "actions", "closing"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Newsletter generation failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Newsletter generation response was empty.");
  }

  return JSON.parse(content) as NewsletterPayload;
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

    const body = (await request.json()) as {
      keyword?: string;
      periodKey?: string;
    };

    if (!body.keyword?.trim()) {
      return NextResponse.json(
        { error: "뉴스레터에 반영할 키워드를 입력하세요." },
        { status: 400 },
      );
    }

    const periodKey = body.periodKey ?? "30d";
    const cutoff = getPeriodCutoff(periodKey);

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, place_name")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (storeError) {
      throw new Error(storeError.message);
    }

    if (!store) {
      return NextResponse.json(
        { error: "뉴스레터를 만들 가게 데이터가 없습니다." },
        { status: 400 },
      );
    }

    const queryEmbedding = await createEmbeddingVector(
      `${store.place_name ?? "가게"}의 ${body.keyword.trim()} 관련 마케팅 인사이트와 고객 반응`,
    );

    const { data: matchedChunks, error: matchError } = await supabase.rpc(
      "match_knowledge_chunks",
      {
        query_embedding: queryEmbedding,
        match_user_id: user.id,
        match_count: 24,
        match_store_id: store.id,
      },
    );

    if (matchError) {
      throw new Error(matchError.message);
    }

    const periodFilteredChunks =
      (matchedChunks as KnowledgeChunkMatch[] | null)?.filter((chunk) =>
        withinPeriod(chunk, cutoff),
      ) ?? [];

    const { data: reviewRows, error: reviewError } = await supabase
      .from("reviews")
      .select("review_date")
      .eq("store_id", store.id)
      .order("review_date", { ascending: true });

    if (reviewError) {
      throw new Error(reviewError.message);
    }

    const periodReviewDates = (reviewRows ?? [])
      .map((row) => row.review_date)
      .filter((value): value is string => Boolean(value))
      .filter((value) => (cutoff ? new Date(value) >= cutoff : true));

    if (!periodReviewDates.length) {
      return NextResponse.json(
        { error: "선택한 기간에 뉴스레터를 만들 리뷰 데이터가 없습니다." },
        { status: 400 },
      );
    }

    const periodStart = periodReviewDates[0];
    const periodEnd = periodReviewDates[periodReviewDates.length - 1];

    const newsletterPayload = await generateNewsletter({
      placeName: store.place_name ?? "이름 없는 가게",
      keyword: body.keyword.trim(),
      periodLabel: getPeriodLabel(periodKey),
      reviewCount: periodReviewDates.length,
      context: stringifyContext(periodFilteredChunks.slice(0, 18)),
    });

    const generatedText = buildNewsletterText({
      periodStart,
      periodEnd,
      keyword: body.keyword.trim(),
      payload: newsletterPayload,
    });

    const { error: insertError } = await supabase.from("newsletters").insert({
      user_id: user.id,
      analysis_period_start: periodStart,
      analysis_period_end: periodEnd,
      generated_text: generatedText,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json({
      message: "뉴스레터를 생성해 목록에 저장했습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "뉴스레터 생성 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}

