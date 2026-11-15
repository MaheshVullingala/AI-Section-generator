import { Suspense } from "react";
import { ProjectView } from "@/components/app/ProjectView";

async function Content({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectView projectId={projectId} />;
}

export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
