import type { ShellRoute } from "./types";

type RouteModules = Record<string, { default: ShellRoute }>;

const fileStems = new WeakMap<ShellRoute, string>();
const sectionOrder = { main: 0, portfolio: 1, footer: 2 };

export function buildRegistry(
  modules: RouteModules = import.meta.glob<{ default: ShellRoute }>("../routes/*.route.tsx", { eager: true }),
): ShellRoute[] {
  return Object.entries(modules).map(([filename, module]) => {
    const route = { ...module.default };
    fileStems.set(route, filename.split("/").pop()!.replace(/\.route\.tsx$/, ""));
    return route;
  }).sort((a, b) =>
    (a.section === null ? 3 : sectionOrder[a.section]) - (b.section === null ? 3 : sectionOrder[b.section])
    || a.order - b.order,
  );
}

export function validateRegistry(routes: ShellRoute[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const byId = new Map(routes.map(route => [route.id, route]));
  const byPath = new Map(routes.filter(route => route.path !== undefined).map(route => [route.path!, route]));

  for (const route of routes) {
    if (ids.has(route.id)) errors.push(`Duplicate route id: ${route.id}`);
    ids.add(route.id);
    if (route.path !== undefined) {
      if (paths.has(route.path)) errors.push(`Duplicate route path: ${route.path}`);
      paths.add(route.path);
    }
    const stem = fileStems.get(route);
    if (stem !== undefined && stem !== route.id) errors.push(`Route id ${route.id} does not match file stem ${stem}`);
    if (route.parentId && !byId.has(route.parentId)) errors.push(`Missing parent ${route.parentId} for route ${route.id}`);

    if (route.kind === "group") {
      if (!routes.some(child => child.parentId === route.id)) errors.push(`Group ${route.id} has no children`);
      if (route.page) errors.push(`Group ${route.id} must not have a page`);
      if (!route.redirectTo) {
        errors.push(`Group ${route.id} needs a redirect target`);
      } else {
        const target = byPath.get(route.redirectTo);
        if (!target) errors.push(`Missing redirect target ${route.redirectTo} for group ${route.id}`);
        else if (target.kind === "group") errors.push(`Group ${route.id} must redirect to a non-group route`);
      }
    } else if (!route.page && !route.redirectTo) {
      errors.push(route.status === "live"
        ? `Live route ${route.id} needs a page or redirect`
        : `Route ${route.id} needs a page or redirect`);
    }
    if (route.status === "placeholder" && !route.title?.trim()) errors.push(`Placeholder route ${route.id} needs a title`);
    if (route.section !== null) {
      if (!route.label?.trim()) errors.push(`Menu route ${route.id} needs a label`);
      if (!route.icon) errors.push(`Menu route ${route.id} needs an icon`);
    }

    const seen = new Set<ShellRoute>();
    let current: ShellRoute | undefined = route;
    while (current?.redirectTo) {
      if (seen.has(current)) {
        errors.push(`Redirect cycle at route ${route.id}`);
        break;
      }
      seen.add(current);
      current = byPath.get(current.redirectTo);
    }
  }
  return errors;
}
