import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { getFreshStationsData } from "@/lib/freshness";
import { getMe } from "@/lib/me";
import { getUserId } from "@/lib/user";
import Loading from "./loading";

async function DashboardLoader() {
  const userId = await getUserId();
  const [data, me] = await Promise.all([getFreshStationsData(), getMe(userId)]);
  return <Dashboard initialData={data} initialMe={me} />;
}

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardLoader />
    </Suspense>
  );
}
