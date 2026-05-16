import { NextResponse } from "next/server";
import { createEmbeddingVector } from "@/lib/embeddings";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DashboardResponse = {
  strengths: Array<{ title: string; detail: string }>;
  weaknesses: Array<{ title: string; detail: string }>;
  issues: Array<{ title: string; problem: string; recommendation: string }>;
};

type KnowledgeChunkMatch = {
  id: string;
  source_kind: "store" | "menu" | "review";
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

const periodOptions = [
  { key: "7d", label: "최근 7일", days: 7 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "90d", label: "최근 90일", days: 90 },
  { key: "all", label: "전체", days: null },
] as const;

function getAnalysisModel() {
  return process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";
}

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
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

function withinPeriod(
  chunk: KnowledgeChunkMatch,
  cutoff: Date | null,
) {
  if (!cutoff || chunk.source_kind !== "review") {
    return true;
  }

  const reviewDate = chunk.metadata?.reviewDate;

  if (typeof reviewDate !== "string") {
    return false;
  }

  return new Date(reviewDate) >= cutoff;
}

function toBulletList(chunks: KnowledgeChunkMatch[]) {
  return chunks
    .map((chunk) => `- [${chunk.source_kind}] ${chunk.content}`)
    .join("\n");
}

async function retrieveContext(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  storeId: string;
  periodKey: string;
}) {
  const cutoff = getPeriodCutoff(params.periodKey);

  const prompts = [
    "이 가게 리뷰에서 고객이 반복적으로 칭찬하는 장점을 찾는다.",
    "이 가게 리뷰에서 고객이 반복적으로 지적하는 단점과 불만을 찾는다.",
    "이 가게 리뷰를 바탕으로 운영상 해결이 필요한 문제와 실행 가능한 개선안을 찾는다.",
  ];

  const vectors = await Promise.all(prompts.map((prompt) => createEmbeddingVector(prompt)));

  const results = await Promise.all(
    vectors.map((queryEmbedding) =>
      params.supabase.rpc("match_knowledge_chunks", {
        query_embedding: queryEmbedding,
        match_user_id: params.userId,
        match_count: 18,
        match_store_id: params.storeId,
      }),
    ),
  );

  results.forEach((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }
  });

  return {
    strengths:
      (results[0].data as KnowledgeChunkMatch[] | null)?.filter((chunk) =>
        withinPeriod(chunk, cutoff),
      ) ?? [],
    weaknesses:
      (results[1].data as KnowledgeChunkMatch[] | null)?.filter((chunk) =>
        withinPeriod(chunk, cutoff),
      ) ?? [],
    issues:
      (results[2].data as KnowledgeChunkMatch[] | null)?.filter((chunk) =>
        withinPeriod(chunk, cutoff),
      ) ?? [],
  };
}

async function generateDashboardResponse(input: {
  placeName: string;
  periodLabel: string;
  reviewCount: number;
  strengthsContext: string;
  weaknessesContext: string;
  issuesContext: string;
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
            "너는 소상공인 리뷰 분석을 수행하는 분석가다. 반드시 한국어 JSON만 반환하고, 과장 없이 주어진 근거에 기반해 간결하게 정리한다.",
        },
        {
          role: "user",
          content: [
            `${input.placeName}의 ${input.periodLabel} 리뷰 분석을 작성한다.`,
            `검토 대상 리뷰 수: ${input.reviewCount}`,
            "",
            "[장점 관련 컨텍스트]",
            input.strengthsContext || "- 관련 컨텍스트 없음",
            "",
            "[단점 관련 컨텍스트]",
            input.weaknessesContext || "- 관련 컨텍스트 없음",
            "",
            "[문제 및 개선안 관련 컨텍스트]",
            input.issuesContext || "- 관련 컨텍스트 없음",
            "",
            "다음 JSON 스키마로만 응답한다.",
            `{
  "strengths": [{"title": "string", "detail": "string"}],
  "weaknesses": [{"title": "string", "detail": "string"}],
  "issues": [{"title": "string", "problem": "string", "recommendation": "string"}]
}`,
            "strengths와 weaknesses는 각각 최대 3개, issues는 최대 3개만 반환한다.",
          ].join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "dashboard_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              strengths: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    detail: { type: "string" },
                  },
                  required: ["title", "detail"],
                },
              },
              weaknesses: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    detail: { type: "string" },
                  },
                  required: ["title", "detail"],
                },
              },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    problem: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["title", "problem", "recommendation"],
                },
              },
            },
            required: ["strengths", "weaknesses", "issues"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Dashboard analysis failed: ${await response.text()}`);
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
    throw new Error("Dashboard analysis response was empty.");
  }

  return JSON.parse(content) as DashboardResponse;
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
      periodKey?: string;
    };

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
        { error: "분석할 가게 데이터가 없습니다." },
        { status: 400 },
      );
    }

    let reviewQuery = supabase
      .from("reviews")
      .select("id", { count: "exact" })
      .eq("store_id", store.id);

    if (cutoff) {
      reviewQuery = reviewQuery.gte(
        "review_date",
        cutoff.toISOString().slice(0, 10),
      );
    }

    const { count: reviewCount, error: reviewCountError } = await reviewQuery;

    if (reviewCountError) {
      throw new Error(reviewCountError.message);
    }

    const retrieved = await retrieveContext({
      supabase,
      userId: user.id,
      storeId: store.id,
      periodKey,
    });

    const dashboard = await generateDashboardResponse({
      placeName: store.place_name ?? "이름 없는 가게",
      periodLabel: getPeriodLabel(periodKey),
      reviewCount: reviewCount ?? 0,
      strengthsContext: toBulletList(retrieved.strengths.slice(0, 10)),
      weaknessesContext: toBulletList(retrieved.weaknesses.slice(0, 10)),
      issuesContext: toBulletList(retrieved.issues.slice(0, 10)),
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "분석 생성 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}
