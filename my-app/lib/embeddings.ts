const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export type KnowledgeChunkInput = {
  userId: string;
  storeId: string;
  sourceKind: "store" | "menu" | "review";
  sourceRecordId: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type OpenAIEmbeddingResponse = {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
};

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function buildBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

async function createEmbeddingVectors(inputs: string[]) {
  const apiKey = getOpenAiApiKey();
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const vectors: string[] = [];

  const batches = buildBatches(inputs, 50);

  for (const batch of batches) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: batch,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding generation failed: ${errorText}`);
    }

    const payload = (await response.json()) as OpenAIEmbeddingResponse;

    payload.data.forEach((item) => {
      vectors.push(vectorLiteral(item.embedding));
    });
  }

  return vectors;
}

export async function createEmbeddingVector(input: string) {
  const [vector] = await createEmbeddingVectors([input]);
  return vector;
}

export async function createKnowledgeChunkRows(chunks: KnowledgeChunkInput[]) {
  if (!chunks.length) {
    return [];
  }

  const embeddings = await createEmbeddingVectors(
    chunks.map((chunk) => chunk.content),
  );

  const rows: Array<
    KnowledgeChunkInput & {
      embedding: string;
    }
  > = [];

  chunks.forEach((chunk, index) => {
    rows.push({
      ...chunk,
      embedding: embeddings[index],
    });
  });

  return rows;
}
