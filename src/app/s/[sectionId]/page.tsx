import { Suspense } from "react";
import { Workspace } from "@/components/app/Workspace";

async function Content({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  return <Workspace sectionId={sectionId} />;
}

export default function Page({ params }: { params: Promise<{ sectionId: string }> }) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
