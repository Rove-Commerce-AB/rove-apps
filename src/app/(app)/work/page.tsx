import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export default function WorkIndexPage() {
  redirect(ROUTES.workOverview);
}
