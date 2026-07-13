import { NextResponse, type NextRequest } from "next/server";
import {
  createOrRefineObservation,
  InputValidationError,
  listObservations,
  type CreateObservationInput,
} from "@/server/services/observation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ observations: await listObservations() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateObservationInput | null;

  try {
    const observation = await createOrRefineObservation(body ?? {});
    return NextResponse.json({ observation });
  } catch (err) {
    if (err instanceof InputValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/observations] failed to create observation:", err);
    return NextResponse.json({ error: "Could not create observation." }, { status: 500 });
  }
}
