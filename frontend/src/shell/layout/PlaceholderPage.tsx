import { useInRouterContext, useLocation } from "react-router";
import { useRegistry } from "../registry/RegistryContext";
import { resolveRoute } from "../nav/resolve";
import { paths } from "../nav/paths";
import { AppLink } from "../nav/AppLink";
import { PageLayout } from "./PageLayout";

function MatchedPlaceholder({ title }: { title?: string }) {
  const { pathname } = useLocation();
  const routes = useRegistry();
  return <PageLayout title={title ?? resolveRoute(pathname, routes)?.title ?? "Coming soon"}><p className="text-[var(--shell-text-body)]">Coming soon</p><AppLink to={paths.portfolio()} className="inline-block underline decoration-[var(--shell-accent)] underline-offset-4">Investments</AppLink></PageLayout>;
}

export default function PlaceholderPage({ title }: { title?: string }) {
  const inRouter = useInRouterContext();
  return inRouter ? <MatchedPlaceholder title={title} /> : <PageLayout title={title ?? "Coming soon"}><p>Coming soon</p><span>Investments</span></PageLayout>;
}
