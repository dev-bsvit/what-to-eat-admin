import { redirect } from "next/navigation";

export default function ModerationRedirectPage() {
  redirect("/products?view=moderation");
}
