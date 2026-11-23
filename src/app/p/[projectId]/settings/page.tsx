import { Suspense } from "react";
import { ProjectSettings } from "@/components/app/ProjectSettings";

async function Content({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectSettings projectId={projectId} />;
}

export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
