"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    try {
      setIsSubmitting(true);

      const supabase = createClient();
      const { data, error } =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({
              email: email.trim().toLowerCase(),
              password,
            })
          : await supabase.auth.signUp({
              email: email.trim().toLowerCase(),
              password,
            });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        router.push("/archive");
        router.refresh();
        return;
      }

      setSuccessMessage("회원가입이 완료되었습니다. 이메일 인증이 필요할 수 있습니다.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "인증 설정이 완료되지 않았습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#f5e1d2_0%,#efe8df_42%,#ddd7cf_100%)] px-6 py-12 text-[#494954]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[14%] top-[14%] h-40 w-40 rounded-full bg-white/25 blur-3xl" />
        <div className="absolute bottom-[12%] right-[10%] h-56 w-56 rounded-full bg-stone-900/10 blur-3xl" />
      </div>

      <section className="relative w-full max-w-md rounded-[28px] border border-white/50 bg-white/78 p-8 shadow-[0_24px_80px_rgba(53,38,23,0.16)] backdrop-blur sm:p-10">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo.svg"
            alt="BaDang logo"
            width={148}
            height={48}
            priority
            className="h-12 w-auto"
          />
        </div>

        <div className="mb-8 grid grid-cols-2 rounded-2xl bg-white/80 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("sign-in");
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className={`h-11 rounded-2xl text-sm font-medium transition ${
              mode === "sign-in"
                ? "bg-[#759AFC] text-white"
                : "text-[#494954] hover:bg-black/5"
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("sign-up");
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className={`h-11 rounded-2xl text-sm font-medium transition ${
              mode === "sign-up"
                ? "bg-[#759AFC] text-white"
                : "text-[#494954] hover:bg-black/5"
            }`}
          >
            회원가입
          </button>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-[#494954]">
            {mode === "sign-in" ? "로그인" : "회원가입"}
          </h1>
          <p className="text-sm leading-6 text-[#494954]/65">
            {mode === "sign-in"
              ? "이메일과 비밀번호를 입력하세요."
              : "이메일과 비밀번호로 새 계정을 만드세요."}
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[#494954]">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
              className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-[#494954] outline-none transition placeholder:text-[#494954]/40 focus:border-stone-400 focus:bg-white"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[#494954]">
              비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호 입력"
              autoComplete="current-password"
              required
              className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm text-[#494954] outline-none transition placeholder:text-[#494954]/40 focus:border-stone-400 focus:bg-white"
            />
          </label>

          {errorMessage ? (
            <p className="text-sm leading-6 text-[#d84c3e]">{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <p className="text-sm leading-6 text-[#4f7cf7]">{successMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#759AFC] text-sm font-medium text-white transition hover:bg-[#5f86ef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting
              ? mode === "sign-in"
                ? "로그인 중..."
                : "가입 중..."
              : mode === "sign-in"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>
      </section>
    </main>
  );
}
