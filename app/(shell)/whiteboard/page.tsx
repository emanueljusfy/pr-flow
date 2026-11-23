import { PageHeader } from "@/components/layout/page-header";
import { ptBR } from "@/modules/messages/pt-BR";
import { WhiteboardPage } from "@/modules/whiteboard/components/whiteboard-page";

export default function WhiteboardRoutePage() {
  return (
    <div className="app-shell flex min-h-0 flex-1 flex-col">
      <PageHeader title={ptBR.whiteboard.pageTitle} description={ptBR.whiteboard.pageHelp} />
      <WhiteboardPage />
    </div>
  );
}
