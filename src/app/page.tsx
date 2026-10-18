import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";

export default async function Home() {
  redirect((await getSessionUser()) ? "/dashboard" : "/login");
}
