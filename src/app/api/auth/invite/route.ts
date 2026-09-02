import { NextResponse } from "next/server";
import {
  createOrUpdateInvitation,
  findInvitationByEmail,
  seedInitialInvitations,
  type UserRole,
} from "@/server/repositories/user-repository";
import { generateSecureToken } from "@/server/auth/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { origin } = new URL(req.url);
    const { aidenInvite, nateInvite } = await seedInitialInvitations();

    return NextResponse.json({
      invitations: [
        {
          email: aidenInvite.email,
          name: aidenInvite.name,
          role: aidenInvite.role,
          claimed: Boolean(aidenInvite.claimedAt),
          setupUrl: `${origin}/setup-account?token=${aidenInvite.token}`,
        },
        {
          email: nateInvite.email,
          name: nateInvite.name,
          role: nateInvite.role,
          claimed: Boolean(nateInvite.claimedAt),
          setupUrl: `${origin}/setup-account?token=${nateInvite.token}`,
        },
      ],
    });
  } catch (err: any) {
    console.error("[invite GET error]", err);
    return NextResponse.json({ error: "Failed to load invitations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, name, role, title } = body;

    if (!email || !name || !role) {
      return NextResponse.json({ error: "Missing required fields: email, name, role" }, { status: 400 });
    }

    if (role !== "host" && role !== "leader") {
      return NextResponse.json({ error: "Role must be 'host' or 'leader'" }, { status: 400 });
    }

    const { origin } = new URL(req.url);
    const token = generateSecureToken(24);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    const invite = await createOrUpdateInvitation({
      email,
      name,
      role: role as UserRole,
      title,
      token,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      setupUrl: `${origin}/setup-account?token=${invite.token}`,
      invite,
    });
  } catch (err: any) {
    console.error("[invite POST error]", err);
    return NextResponse.json({ error: err.message || "Failed to create invitation" }, { status: 500 });
  }
}
