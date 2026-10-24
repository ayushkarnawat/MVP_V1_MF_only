import { Component, lazy } from "react";
import type { ReactNode } from "react";
import { PageState } from "./PageState";
import { PageModuleContext } from "./pageModules";
import type { LazyPageComponent, PageLoader } from "./pageModules";

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  // This boundary commits above Suspense, preserving lazy identities even when
  // the first page render suspends. Only an explicit retry clears the cache.
  private pages = new Map<PageLoader, LazyPageComponent>();
  private getPage = (loader: PageLoader): LazyPageComponent => {
    let page = this.pages.get(loader);
    if (!page) { page = lazy(loader); this.pages.set(loader, page); }
    return page;
  };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <PageState state="error" onRetry={() => { this.pages.clear(); this.setState({ failed: false }); }} />;
    return <PageModuleContext.Provider value={this.getPage}>{this.props.children}</PageModuleContext.Provider>;
  }
}
