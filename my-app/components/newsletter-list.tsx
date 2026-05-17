"use client";

import { useState } from "react";
import { formatFullDate } from "@/lib/date-format";
import { classNames, surfaceClassName } from "@/lib/ui";

export type NewsletterListItem = {
  id: string;
  analysis_period_start: string;
  analysis_period_end: string;
  generated_text: string;
  created_at: string;
};

type NewsletterListProps = {
  newsletters: NewsletterListItem[];
};

export default function NewsletterList({
  newsletters,
}: NewsletterListProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  function toggleExpanded(id: string) {
    setExpandedIds((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <section className="grid gap-4">
      {newsletters.map((newsletter) => {
        const isExpanded = Boolean(expandedIds[newsletter.id]);

        return (
          <article
            key={newsletter.id}
            className={`${surfaceClassName} px-7 py-6`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#759AFC]">
                  {formatFullDate(newsletter.analysis_period_start)} -{" "}
                  {formatFullDate(newsletter.analysis_period_end)}
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-[#494954]">
                  {formatFullDate(newsletter.created_at)} 생성 뉴스레터
                </h2>
              </div>
              <span className="text-sm text-[#494954]/60">
                {formatFullDate(newsletter.created_at)}
              </span>
            </div>

            <div className="mt-5">
              <p
                className={classNames(
                  "whitespace-pre-line text-base leading-7 text-[#494954]/82",
                  !isExpanded && "line-clamp-3",
                )}
              >
                {newsletter.generated_text}
              </p>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => toggleExpanded(newsletter.id)}
                className="text-sm font-medium text-[#759AFC] transition hover:text-[#5f86ef]"
              >
                {isExpanded ? "접기" : "전체 보기"}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

