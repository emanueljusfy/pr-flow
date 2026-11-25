import { PageHeader } from "@/components/layout/page-header";
import { ArtifactsPage } from "@/modules/artifacts/components/artifacts-page";
import { ptBR } from "@/modules/messages/pt-BR";

export default function ArtifactsRoutePage() {
  return (
    <div className="app-shell flex min-h-0 flex-1 flex-col">
      <PageHeader title={ptBR.artifacts.pageTitle} description={ptBR.artifacts.pageHelp} />
      <ArtifactsPage />
    </div>
  );
}
