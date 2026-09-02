"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck, UserCheck, AlertCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(payload: { email?: string; password?: string; persona?: "host" | "leader" }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        setLoading(false);
        return;
      }

      // If user had a specific deep-link destination and their role allows it, respect it
      const destination = from && !(data.user.role === "host" && from !== "/") ? from : data.redirectTo;
      router.push(destination);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-[#e8eef7] flex flex-col justify-center items-center px-4 py-12 selection:bg-[#43d9c7] selection:text-[#070b12]">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0b7a75] to-[#43d9c7] shadow-lg shadow-[#0b7a75]/20 font-black text-2xl text-[#070b12] tracking-wider mb-2">
            UC
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#f0f6ff]">
            Utah City Host Intelligence
          </h1>
          <p className="text-sm text-[#8292a8]">
            Sign in to access your role-specific workspace
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-sm animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* 1-Tap Demo Quick-Switch */}
        <div className="p-5 rounded-2xl bg-[#101827] border border-[#26354c] space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#8292a8]">
              Demo Quick-Switch
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#43d9c7]/10 text-[#43d9c7] font-semibold border border-[#43d9c7]/20">
              1-Tap Login
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleLogin({ persona: "host" })}
              className="flex items-center justify-between p-3.5 rounded-xl bg-[#131e30] border border-[#26354c] hover:border-[#43d9c7]/60 hover:bg-[#18273f] transition-all text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-semibold text-[#f0f6ff] group-hover:text-[#43d9c7] transition-colors">
                    Aiden (Tour Host)
                  </div>
                  <div className="text-xs text-[#8292a8]">
                    aiden@utahcity.com · Mobile capture
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8292a8] group-hover:text-[#43d9c7] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleLogin({ persona: "leader" })}
              className="flex items-center justify-between p-3.5 rounded-xl bg-[#131e30] border border-[#26354c] hover:border-[#43d9c7]/60 hover:bg-[#18273f] transition-all text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-sm shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-semibold text-[#f0f6ff] group-hover:text-[#43d9c7] transition-colors">
                    Nate (Leadership)
                  </div>
                  <div className="text-xs text-[#8292a8]">
                    nate@utahcity.com · Command & Analyst
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#8292a8] group-hover:text-[#43d9c7] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          </div>
        </div>

        {/* Traditional Credentials Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin({ email, password });
          }}
          className="p-5 rounded-2xl bg-[#101827] border border-[#26354c] space-y-4 shadow-xl"
        >
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#8292a8]">
            Or Sign In With Password
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#b8c5d6]">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@utahcity.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#131e30] border border-[#26354c] text-sm text-[#f0f6ff] placeholder-[#65758b] focus:outline-none focus:border-[#43d9c7] focus:ring-1 focus:ring-[#43d9c7] transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#b8c5d6]">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#131e30] border border-[#26354c] text-sm text-[#f0f6ff] placeholder-[#65758b] focus:outline-none focus:border-[#43d9c7] focus:ring-1 focus:ring-[#43d9c7] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#43d9c7] text-[#070b12] font-bold text-sm hover:bg-[#38c4b3] transition-colors shadow-lg shadow-[#43d9c7]/20 disabled:opacity-50 mt-2"
          >
            <Lock className="h-4 w-4" />
            <span>{loading ? "Authenticating..." : "Sign in to workspace"}</span>
          </button>
        </form>

        <p className="text-center text-xs text-[#65758b]">
          Utah City Host Intelligence Platform · Two-Week Internal Pilot
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070b12]" />}>
      <LoginForm />
    </Suspense>
  );
}
