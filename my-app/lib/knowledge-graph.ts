import type { createClient } from "@/lib/supabase/server";

export type GraphSourceReview = {
  id: string;
  rating: number | null;
  content: string;
};

export type GraphSourceMenu = {
  id: string;
  name: string;
  price_text?: string | null;
};

type GraphNodeType =
  | "store"
  | "menu"
  | "keyword"
  | "strength"
  | "weakness"
  | "issue"
  | "customer_group";

type GraphRelationType =
  | "store_has_menu"
  | "store_has_keyword"
  | "store_has_strength"
  | "store_has_weakness"
  | "store_has_issue"
  | "store_serves_customer_group";

type GraphNodeDraft = {
  nodeType: GraphNodeType;
  label: string;
  weight: number;
  metadata?: Record<string, unknown>;
};

type GraphEdgeDraft = {
  source: Pick<GraphNodeDraft, "nodeType" | "label">;
  target: Pick<GraphNodeDraft, "nodeType" | "label">;
  relationType: GraphRelationType;
  weight: number;
  metadata?: Record<string, unknown>;
};

export type GraphBuildResult = {
  nodes: GraphNodeDraft[];
  edges: GraphEdgeDraft[];
};

type PatternRule = {
  label: string;
  nodeType: Extract<GraphNodeType, "keyword" | "strength" | "weakness" | "issue" | "customer_group">;
  patterns: string[];
};

const patternRules: PatternRule[] = [
  {
    label: "맛",
    nodeType: "strength",
    patterns: ["맛있", "마싯", "맛 좋", "먹을만", "무난"],
  },
  {
    label: "가성비",
    nodeType: "strength",
    patterns: ["가성비", "가격", "저렴", "싸", "런치"],
  },
  {
    label: "친절",
    nodeType: "strength",
    patterns: ["친절", "응대", "바로 해"],
  },
  {
    label: "분위기",
    nodeType: "keyword",
    patterns: ["분위기", "휴식", "넓", "쾌적"],
  },
  {
    label: "혼잡",
    nodeType: "issue",
    patterns: ["사람", "많", "바글", "정신없", "혼잡", "앉을 수 없"],
  },
  {
    label: "대기",
    nodeType: "issue",
    patterns: ["줄", "대기", "기다", "안줄", "20분"],
  },
  {
    label: "청결",
    nodeType: "weakness",
    patterns: ["청소", "위생", "깨끗", "깔끔", "더럽"],
  },
  {
    label: "불친절",
    nodeType: "weakness",
    patterns: ["불친절", "성질", "기분", "예의", "던져"],
  },
  {
    label: "음악/소음",
    nodeType: "issue",
    patterns: ["시끄럽", "음악", "소음"],
  },
  {
    label: "영업시간",
    nodeType: "issue",
    patterns: ["닫", "영업", "허탕", "시간"],
  },
  {
    label: "키오스크",
    nodeType: "issue",
    patterns: ["키오스크", "주문"],
  },
  {
    label: "외국인 고객",
    nodeType: "customer_group",
    patterns: ["외국인", "관광객", "여행", "해외"],
  },
];

function normalizeLabel(label: string) {
  return label.replace(/\s+/g, "").toLowerCase();
}

function isPositiveReview(rating: number | null, content: string) {
  if (rating !== null) {
    return rating >= 4;
  }

  return /좋|맛있|친절|깨끗|괜찮|애용|추천/.test(content);
}

function isNegativeReview(rating: number | null, content: string) {
  if (rating !== null) {
    return rating <= 2;
  }

  return /별로|불친절|고통|아쉽|최악|시끄럽|더럽|문제|허탕/.test(content);
}

function mergeNode(
  nodeMap: Map<string, GraphNodeDraft>,
  node: GraphNodeDraft,
) {
  const key = `${node.nodeType}:${normalizeLabel(node.label)}`;
  const existing = nodeMap.get(key);

  if (!existing) {
    nodeMap.set(key, node);
    return;
  }

  existing.weight += node.weight;
  existing.metadata = {
    ...(existing.metadata ?? {}),
    ...(node.metadata ?? {}),
  };
}

function mergeEdge(
  edgeMap: Map<string, GraphEdgeDraft>,
  edge: GraphEdgeDraft,
) {
  const key = [
    edge.relationType,
    edge.source.nodeType,
    normalizeLabel(edge.source.label),
    edge.target.nodeType,
    normalizeLabel(edge.target.label),
  ].join(":");
  const existing = edgeMap.get(key);

  if (!existing) {
    edgeMap.set(key, edge);
    return;
  }

  existing.weight += edge.weight;
}

export function buildKnowledgeGraph(input: {
  placeName: string | null;
  menus: GraphSourceMenu[];
  reviews: GraphSourceReview[];
}): GraphBuildResult {
  const storeLabel = input.placeName?.trim() || "이름 없는 가게";
  const storeNode = { nodeType: "store" as const, label: storeLabel };
  const nodeMap = new Map<string, GraphNodeDraft>();
  const edgeMap = new Map<string, GraphEdgeDraft>();

  mergeNode(nodeMap, { ...storeNode, weight: 1 });

  input.menus.slice(0, 40).forEach((menu) => {
    const menuNode = {
      nodeType: "menu" as const,
      label: menu.name,
      weight: 1,
      metadata: {
        sourceRecordId: menu.id,
        priceText: menu.price_text ?? null,
      },
    };

    mergeNode(nodeMap, menuNode);
    mergeEdge(edgeMap, {
      source: storeNode,
      target: menuNode,
      relationType: "store_has_menu",
      weight: 1,
    });
  });

  input.reviews.slice(0, 120).forEach((review) => {
    const content = review.content;
    const positive = isPositiveReview(review.rating, content);
    const negative = isNegativeReview(review.rating, content);

    patternRules.forEach((rule) => {
      if (!rule.patterns.some((pattern) => content.includes(pattern))) {
        return;
      }

      const nodeType =
        rule.nodeType === "keyword" && positive
          ? "strength"
          : rule.nodeType === "keyword" && negative
            ? "weakness"
            : rule.nodeType;
      const node = {
        nodeType,
        label: rule.label,
        weight: 1,
        metadata: {
          sourceReviewIds: [review.id],
          lastRating: review.rating,
        },
      };

      mergeNode(nodeMap, node);
      mergeEdge(edgeMap, {
        source: storeNode,
        target: node,
        relationType:
          nodeType === "strength"
            ? "store_has_strength"
            : nodeType === "weakness"
              ? "store_has_weakness"
              : nodeType === "issue"
                ? "store_has_issue"
                : nodeType === "customer_group"
                  ? "store_serves_customer_group"
                  : "store_has_keyword",
        weight: 1,
        metadata: {
          sourceReviewIds: [review.id],
        },
      });
    });
  });

  return {
    nodes: Array.from(nodeMap.values()).slice(0, 180),
    edges: Array.from(edgeMap.values()).slice(0, 400),
  };
}

export function formatGraphContext(input: {
  nodes: Array<{
    node_type: string;
    label: string;
    weight: number | null;
  }>;
  edges: Array<{
    relation_type: string;
    weight: number | null;
    source?: { label?: string | null; node_type?: string | null } | null;
    target?: { label?: string | null; node_type?: string | null } | null;
  }>;
}) {
  const nodeLines = input.nodes
    .slice(0, 30)
    .map(
      (node) =>
        `- [${node.node_type}] ${node.label} (${Math.round(node.weight ?? 1)}회)`,
    );

  const edgeLines = input.edges
    .slice(0, 30)
    .map((edge) => {
      const source = edge.source?.label ?? "가게";
      const target = edge.target?.label ?? "항목";
      return `- ${source} --${edge.relation_type}/${Math.round(edge.weight ?? 1)}회--> ${target}`;
    });

  return [
    "[그래프 노드]",
    nodeLines.length ? nodeLines.join("\n") : "- 그래프 노드 없음",
    "",
    "[그래프 관계]",
    edgeLines.length ? edgeLines.join("\n") : "- 그래프 관계 없음",
  ].join("\n");
}

export async function getKnowledgeGraphContext(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  storeId: string;
}) {
  try {
    const [nodesResult, edgesResult] = await Promise.all([
      params.supabase
        .from("knowledge_nodes")
        .select("node_type, label, weight")
        .eq("user_id", params.userId)
        .eq("store_id", params.storeId)
        .order("weight", { ascending: false })
        .limit(40),
      params.supabase
        .from("knowledge_edges")
        .select(
          "relation_type, weight, source:source_node_id(label,node_type), target:target_node_id(label,node_type)",
        )
        .eq("user_id", params.userId)
        .eq("store_id", params.storeId)
        .order("weight", { ascending: false })
        .limit(40),
    ]);

    if (nodesResult.error || edgesResult.error) {
      return "";
    }

    return formatGraphContext({
      nodes:
        (nodesResult.data as Array<{
          node_type: string;
          label: string;
          weight: number | null;
        }> | null) ?? [],
      edges:
        (edgesResult.data as Array<{
          relation_type: string;
          weight: number | null;
          source?: { label?: string | null; node_type?: string | null } | null;
          target?: { label?: string | null; node_type?: string | null } | null;
        }> | null) ?? [],
    });
  } catch {
    return "";
  }
}
