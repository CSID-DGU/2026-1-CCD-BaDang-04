export function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const surfaceClassName =
  "rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_48px_rgba(53,38,23,0.08)] backdrop-blur";

export const dashboardSurfaceClassName =
  "rounded-[24px] border border-white/70 bg-white/85 shadow-[0_18px_48px_rgba(53,38,23,0.08)]";

export const mutedPanelClassName = "rounded-2xl bg-[#f7f3ee]";

export const primaryButtonClassName =
  "flex items-center justify-center rounded-2xl bg-[#759AFC] text-sm font-medium text-white transition hover:bg-[#5f86ef]";
