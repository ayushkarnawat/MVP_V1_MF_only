import { createContext, useContext } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { ShellRoute } from "../registry/types";

export type PageLoader = NonNullable<ShellRoute["page"]>;
export type LazyPageComponent = LazyExoticComponent<ComponentType>;
export const PageModuleContext = createContext<((loader: PageLoader) => LazyPageComponent) | undefined>(undefined);

export function usePageModule(loader: PageLoader | undefined) {
  const getPage = useContext(PageModuleContext);
  if (!loader) return undefined;
  if (!getPage) throw new Error("Lazy pages must be rendered inside a PageBoundary");
  return getPage(loader);
}
