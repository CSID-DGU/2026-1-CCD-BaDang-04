"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { classNames, primaryButtonClassName } from "@/lib/ui";

const periodOptions = [
  { key: "7d", label: "최근 7일" },
  { key: "30d", label: "최근 30일" },
  { key: "90d", label: "최근 90일" },
  { key: "all", label: "전체" },
] as const;

type NewsletterGeneratorProps = {
  placeName: string | null;
};

function isErrorPayload(
  payload: { message?: string } | { error?: string },
): payload is { error?: string } {
  return "error" in payload;
}

export default function NewsletterGenerator({
  placeName,
}: NewsletterGeneratorProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [selectedPeriod, setSelectedPeriod] =
    useState<(typeof periodOptions)[number]["key"]>("30d");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setNotice("");

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/newsletters/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyword,
          periodKey: selectedPeriod,
        }),
      });

      const payload = (await response.json()) as
        | { message?: string }
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          isErrorPayload(payload)
            ? payload.error ?? "뉴스레터 생성에 실패했습니다."
            : "뉴스레터 생성에 실패했습니다.",
        );
      }

      setNotice(
        !isErrorPayload(payload)
          ? payload.message ?? "뉴스레터를 생성했습니다."
          : "뉴스레터를 생성했습니다.",
      );
      setKeyword("");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "뉴스레터 생성에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <span className="text-sm font-medium text-[#494954]">가게</span>
        <div className="flex min-h-12 items-center rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-[#494954]">
          {placeName ?? "가게 정보 없음"}
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-[#494954]">원하는 키워드</span>
        <input
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="예: 재방문, 런치, 시그니처 메뉴, 외국인 고객"
          required
          className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-[#494954] outline-none transition placeholder:text-[#494954]/40 focus:border-stone-400 focus:bg-white"
        />
      </label>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-[#494954]">분석 기간</span>
        <div className="rounded-[20px] border border-stone-200/70 bg-[#ece5dc] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
      </div>

      {errorMessage ? (
        <p className="text-sm leading-6 text-[#d84c3e]">{errorMessage}</p>
      ) : null}

      {notice ? (
        <p className="text-sm leading-6 text-[#4f7cf7]">{notice}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || !placeName}
        className={classNames(
          primaryButtonClassName,
          "h-12 justify-center px-5 disabled:cursor-not-allowed disabled:opacity-70",
        )}
      >
        {isSubmitting ? "뉴스레터 생성 중..." : "뉴스레터 제작"}
      </button>
    </form>
  );
}
