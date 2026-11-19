import { PageHeader } from "@/components/layout/page-header";
import { RoutinesPage } from "@/modules/routines/components/routines-page";
import { ptBR } from "@/modules/messages/pt-BR";

export default function RoutinesRoutePage() {
  return (
    <div className="app-shell">
      <PageHeader title={ptBR.routines.pageTitle} description={ptBR.routines.pageDescription} />
      <RoutinesPage />
    </div>
  );
}
