import { NextResponse } from "next/server";
import { findUserByEmail, verifyUserCredentials } from "@/server/auth/users";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSessionToken } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, persona } = body;

    let user = null;

    if (persona === "host") {
      user = findUserByEmail("aiden@utahcity.com");
    } else if (persona === "leader") {
      user = findUserByEmail("nate@utahcity.com");
    } else if (email && password) {
      user = verifyUserCredentials(email, password);
    }

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password. Use aiden@utahcity.com or nate@utahcity.com." },
        { status: 401 }
      );
    }

    const token = await signSessionToken(user);
    const redirectTo = user.role === "host" ? "/" : "/command";

    const response = NextResponse.json({
      success: true,
      user,
      redirectTo,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[login error]", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
