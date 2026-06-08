export function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
}

export function getAnalysisModel() {
  return process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5.4";
}

type JsonSchema = {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required: string[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function extractResponseText(payload: OpenAIResponsePayload) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text))
    .join("");
}

function sanitizeInternalTerms(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/Graph RAG/gi, "반복된 고객 반응")
      .replace(/그래프/g, "반복된 고객 반응")
      .replace(/노드/g, "항목")
      .replace(/엣지/g, "연결")
      .replace(/컨텍스트/g, "근거")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternalTerms(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeInternalTerms(item)]),
    );
  }

  return value;
}

export async function createStructuredResponse<T>(input: {
  schemaName: string;
  schema: JsonSchema;
  system: string;
  user: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getAnalysisModel(),
      input: [
        {
          role: "system",
          content: input.system,
        },
        {
          role: "user",
          content: input.user,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
  });

  const payload = (await response.json()) as OpenAIResponsePayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `OpenAI Responses API request failed with status ${response.status}.`,
    );
  }

  const text = extractResponseText(payload);

  if (!text) {
    throw new Error("OpenAI Responses API response was empty.");
  }

  return sanitizeInternalTerms(JSON.parse(text)) as T;
}
