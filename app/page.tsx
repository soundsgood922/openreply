import { redirect } from "next/navigation";

// This deployment is a private dashboard, not a public site: the address goes
// straight to the dashboard, whose layout sends anyone signed out to /login.
export default function Home() {
  redirect("/dashboard");
}
