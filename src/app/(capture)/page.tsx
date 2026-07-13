import { MobileCaptureApp } from "@/components/MobileCaptureApp";
import { hasASR } from "@/server/ai/model-config";

export const dynamic = "force-dynamic";

export default function Home() {
  return <MobileCaptureApp serverAsr={hasASR()} />;
}
