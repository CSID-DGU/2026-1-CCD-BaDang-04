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
  lead: string;
  body: string;
  suggestion: string;
  closing: string;
};

function normalizeForKeywordMatch(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

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
    input.payload.lead,
    "",
    input.payload.body,
    "",
    input.payload.suggestion,
    input.payload.closing,
  ].join("\n");
}

async function generateNewsletter(input: {
  placeName: string;
  keyword: string;
  periodLabel: string;
  reviewCount: number;
  context: string;
  keywordContext: string;
  keywordEvidenceCount: number;
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
            "너는 소상공인 사장님에게 쉬운 말로 마케팅 힌트를 전하는 뉴스레터 에디터다. 반드시 한국어 JSON만 반환한다. 리뷰와 메뉴 데이터는 사실 근거로 쓰고, 사용자가 준 키워드는 마케팅 주제로 해석한다. 키워드가 리뷰에 직접 나오지 않아도 일반적인 마케팅 지식을 활용해 가게 상황과 연결할 수 있다. 다만 리뷰에 없는 내용을 손님이 실제로 말했다고 쓰면 안 된다.",
        },
        {
          role: "user",
          content: [
            `${input.placeName}의 ${input.periodLabel} 데이터로 AI 뉴스레터를 만든다.`,
            `핵심 키워드: ${input.keyword}`,
            `검토 대상 리뷰 수: ${input.reviewCount}`,
            `키워드 직접 근거 수: ${input.keywordEvidenceCount}`,
            "",
            "[키워드 직접 관련 컨텍스트]",
            input.keywordContext || "- 키워드 직접 일치 컨텍스트 없음",
            "",
            "[RAG 컨텍스트]",
            input.context || "- 관련 컨텍스트 없음",
            "",
            "[작성 원칙]",
            [
              "리뷰/메뉴 컨텍스트에 있는 내용은 실제 가게 상황으로 써도 된다.",
              "키워드 직접 근거 수가 0이면, 그 키워드가 리뷰에 직접 나온 것처럼 쓰지 않는다.",
              "키워드 직접 근거가 부족할 때는 '리뷰에 직접 많이 나온 이야기는 아니지만', '가게 상황을 보면 이렇게 연결해볼 수 있습니다'처럼 구분해서 쓴다.",
              "모델의 일반 마케팅 지식은 아이디어와 제안에만 사용한다.",
              "손님 반응, 평판, 메뉴 언급은 반드시 컨텍스트에 근거가 있을 때만 단정한다.",
              "키워드는 제목, 본문, 제안 중 최소 2곳에서 자연스럽게 드러나야 한다.",
            ].join(" "),
            "",
            "다음 JSON 스키마로만 응답한다.",
            `{
  "headline": "string",
  "lead": "string",
  "body": "string",
  "suggestion": "string",
  "closing": "string"
}`,
            [
              "이 결과물은 보고서가 아니라 소상공인 사장님이 읽는 친근한 뉴스레터다.",
              "문장형 단락으로 써야 하고, 불릿 목록처럼 쓰지 않는다.",
              "너무 딱딱한 표현, 컨설팅 보고서 말투, 과장된 마케팅 문구는 피한다.",
              "50대 이상 자영업자도 바로 이해할 수 있게 쉬운 한국어로 쓴다.",
              "headline은 제목 한 줄이다.",
              "lead는 인사말 없이 바로 핵심 상황을 2~3문장으로 설명한다.",
              "body는 키워드를 중심으로 고객 반응, 메뉴, 운영 포인트를 자연스러운 줄글 1~2단락으로 풀어쓴다.",
              "suggestion은 당장 실행해볼 만한 제안을 부드러운 말투의 짧은 단락으로 쓴다.",
              "closing은 부담 없는 마무리 문장 1~2문장으로 쓴다.",
              "반드시 입력된 키워드가 본문에서 자연스럽게 드러나야 한다.",
            ].join(" "),
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
              lead: { type: "string" },
              body: { type: "string" },
              suggestion: { type: "string" },
              closing: { type: "string" },
            },
            required: ["headline", "lead", "body", "suggestion", "closing"],
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

    const keyword = body.keyword.trim();
    const [insightQueryEmbedding, directKeywordEmbedding, storeContextEmbedding] =
      await Promise.all([
      createEmbeddingVector(
        `${store.place_name ?? "가게"}의 ${keyword} 관련 마케팅 인사이트와 고객 반응`,
      ),
      createEmbeddingVector(`${keyword}`),
      createEmbeddingVector(
        `${store.place_name ?? "가게"}의 주요 메뉴, 장점, 단점, 고객 반응, 운영 상황`,
      ),
    ]);

    const [insightMatchResult, keywordMatchResult, storeContextMatchResult] =
      await Promise.all([
      supabase.rpc("match_knowledge_chunks", {
        query_embedding: insightQueryEmbedding,
        match_user_id: user.id,
        match_count: 24,
        match_store_id: store.id,
      }),
      supabase.rpc("match_knowledge_chunks", {
        query_embedding: directKeywordEmbedding,
        match_user_id: user.id,
        match_count: 24,
        match_store_id: store.id,
      }),
      supabase.rpc("match_knowledge_chunks", {
        query_embedding: storeContextEmbedding,
        match_user_id: user.id,
        match_count: 24,
        match_store_id: store.id,
      }),
    ]);

    if (insightMatchResult.error) {
      throw new Error(insightMatchResult.error.message);
    }

    if (keywordMatchResult.error) {
      throw new Error(keywordMatchResult.error.message);
    }

    if (storeContextMatchResult.error) {
      throw new Error(storeContextMatchResult.error.message);
    }

    const combinedChunks = [
      ...((insightMatchResult.data as KnowledgeChunkMatch[] | null) ?? []),
      ...((keywordMatchResult.data as KnowledgeChunkMatch[] | null) ?? []),
      ...((storeContextMatchResult.data as KnowledgeChunkMatch[] | null) ?? []),
    ];

    const uniqueChunks = Array.from(
      new Map(combinedChunks.map((chunk) => [chunk.content, chunk])).values(),
    );

    const periodFilteredChunks = uniqueChunks.filter((chunk) =>
      withinPeriod(chunk, cutoff),
    );

    const normalizedKeyword = normalizeForKeywordMatch(keyword);
    const keywordMatchedChunks = periodFilteredChunks.filter((chunk) =>
      normalizeForKeywordMatch(chunk.content).includes(normalizedKeyword),
    );

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
      keyword,
      periodLabel: getPeriodLabel(periodKey),
      reviewCount: periodReviewDates.length,
      context: stringifyContext(
        (keywordMatchedChunks.length
          ? [...keywordMatchedChunks, ...periodFilteredChunks]
          : periodFilteredChunks
        ).slice(0, 18),
      ),
      keywordContext: stringifyContext(keywordMatchedChunks.slice(0, 10)),
      keywordEvidenceCount: keywordMatchedChunks.length,
    });

    const generatedText = buildNewsletterText({
      periodStart,
      periodEnd,
      keyword,
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
