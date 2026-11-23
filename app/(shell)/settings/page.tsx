import { redirect } from "next/navigation";
import { DEFAULT_SETTINGS_TAB } from "@/modules/settings/lib/settings-tabs";

export default function SettingsIndexPage() {
  redirect(DEFAULT_SETTINGS_TAB);
}
