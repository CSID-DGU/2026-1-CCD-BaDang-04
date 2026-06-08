import { NextResponse } from "next/server";
import { createEmbeddingVector } from "@/lib/embeddings";
import { getKnowledgeGraphContext } from "@/lib/knowledge-graph";
import { createStructuredResponse } from "@/lib/openai";
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
  graphContext: string;
}) {
  return createStructuredResponse<DashboardResponse>({
    schemaName: "dashboard_analysis",
    system:
      "너는 40~60대 중장년 시니어 자영업자 사장님을 위한 소상공인 리뷰 분석가다. 반드시 한국어 JSON만 반환하고, 과장 없이 주어진 근거에 기반해 간결하게 정리한다. 분석의 1차 기준은 실제 고객 반응이며, Kano 모델, SERVPERF, Grönroos 서비스 품질 모델은 놓친 관점을 점검하는 내부 보조 체크리스트로만 사용한다. 최종 출력에는 모델명이나 이론 용어를 직접 언급하지 않는다. 말투는 친근하지만 가볍지 않게, 쉬운 단어와 짧은 문장으로 쓴다.",
    user: [
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
            "[반복 고객 반응 요약]",
            input.graphContext || "- 반복 고객 반응 요약 없음",
            "",
            "다음 JSON 스키마로만 응답한다.",
            `{
  "strengths": [{"title": "string", "detail": "string"}],
  "weaknesses": [{"title": "string", "detail": "string"}],
  "issues": [{"title": "string", "problem": "string", "recommendation": "string"}]
}`,
            [
              "반복 고객 반응 요약은 자주 함께 나타난 메뉴, 강점, 약점, 이슈, 고객군을 파악하는 보조 근거다.",
              "Kano 모델은 기본 기대, 만족 강화, 매력 요소, 불만 요소를 놓치지 않았는지 확인하는 내부 체크리스트로만 참고한다.",
              "SERVPERF는 신뢰성, 응답성, 확신성, 공감성, 유형성 관점을 빠뜨리지 않았는지 확인하는 내부 체크리스트로만 참고한다.",
              "Grönroos 모델은 결과 품질, 과정 품질, 이미지 품질 관점을 빠뜨리지 않았는지 확인하는 내부 체크리스트로만 참고한다.",
              "세 서비스 품질 모델의 항목을 억지로 모두 채우지 말고, 실제 리뷰와 메뉴 근거가 있는 내용만 반영한다.",
              "최종 JSON에는 Kano, SERVPERF, Grönroos 같은 이론명이나 신뢰성, 응답성, 유형성 같은 이론 용어를 쓰지 않는다.",
              "최종 JSON에는 Graph RAG, 그래프, 노드, 엣지, 컨텍스트 같은 내부 기술 용어를 쓰지 않는다.",
              "40~60대 자영업자가 바로 이해할 수 있도록 전문 용어, 플랫폼 업계 은어, 과한 영어 표현을 피한다.",
              "문장은 길게 늘이지 말고, 한 문장에 한 가지 뜻만 담는다.",
              "문제와 개선안은 비난하거나 훈계하는 말투가 아니라 옆에서 조언해주는 말투로 쓴다.",
              "개선안은 돈과 시간이 많이 드는 큰 전략보다 오늘 또는 이번 주에 해볼 수 있는 작은 행동으로 쓴다.",
              "'데이터 기반', '퍼널', '세그먼트', '인사이트' 같은 표현은 되도록 쉬운 말로 풀어쓴다.",
              "strengths와 weaknesses는 각각 최대 3개, issues는 최대 3개만 반환한다.",
            ].join(" "),
          ].join("\n"),
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
  });
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
      graphContext: await getKnowledgeGraphContext({
        supabase,
        userId: user.id,
        storeId: store.id,
      }),
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
