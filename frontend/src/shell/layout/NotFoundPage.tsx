import { useInRouterContext } from "react-router";
import { AppLink } from "../nav/AppLink";
import { paths } from "../nav/paths";
import { PageLayout } from "./PageLayout";

export default function NotFoundPage({ title = "Page not found" }: { title?: string }) {
  const inRouter = useInRouterContext();
  return <PageLayout title={title}><p className="text-[var(--shell-text-body)]">We could not find this page.</p>{inRouter && <AppLink to={paths.home()}>Home</AppLink>}</PageLayout>;
}
