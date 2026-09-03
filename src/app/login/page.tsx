"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, AlertCircle, Shield } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password.");
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
      <div className="w-full max-w-md space-y-7">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0b7a75] to-[#43d9c7] shadow-lg shadow-[#0b7a75]/20 font-black text-2xl text-[#070b12] tracking-wider mb-2">
            UC
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#f0f6ff]">
            Utah City Host Intelligence
          </h1>
          <p className="text-sm text-[#8292a8]">
            Sign in with your verified credentials
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-sm animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleLogin}
          suppressHydrationWarning
          className="p-6 rounded-2xl bg-[#101827] border border-[#26354c] space-y-4 shadow-xl"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#b8c5d6]">Email address</label>
            <input
              type="email"
              name="email"
              id="email"
              autoComplete="email"
              suppressHydrationWarning
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
              name="password"
              id="password"
              autoComplete="current-password"
              suppressHydrationWarning
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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#43d9c7] text-[#070b12] font-bold text-sm hover:bg-[#38c4b3] transition-colors shadow-lg shadow-[#43d9c7]/20 disabled:opacity-50 mt-4"
          >
            <Lock className="h-4 w-4" />
            <span>{loading ? "Authenticating..." : "Sign in to workspace"}</span>
          </button>
        </form>

        {/* Access Notice */}
        <div className="p-4 rounded-xl bg-[#101827]/60 border border-[#26354c]/60 flex items-start gap-3 text-xs text-[#8292a8]">
          <Shield className="h-4 w-4 shrink-0 text-[#43d9c7] mt-0.5" />
          <p className="leading-relaxed">
            Access is restricted to authorized Utah City hosts and leaders. If you have received an invitation on your device, please open your setup link to create your account credentials.
          </p>
        </div>

        <p className="text-center text-xs text-[#65758b]">
          Utah City Host Intelligence Platform
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
