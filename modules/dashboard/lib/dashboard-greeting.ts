import { ptBR } from "@/modules/messages/pt-BR";

export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return ptBR.dashboard.greetingMorning;
  }
  if (hour >= 12 && hour < 18) {
    return ptBR.dashboard.greetingAfternoon;
  }
  return ptBR.dashboard.greetingEvening;
}

/** e.g. "Domingo, 23 de novembro" */
export function formatDashboardDateline(date: Date): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
