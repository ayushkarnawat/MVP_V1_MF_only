import { Component, lazy } from "react";
import type { ReactNode } from "react";
import { PageState } from "./PageState";
import { PageModuleContext } from "./pageModules";
import type { LazyPageComponent, PageLoader } from "./pageModules";

// Module level so a navigation (which remounts the keyed boundary) does not re-create React.lazy and refetch;
// only an explicit retry clears it.
const pages = new Map<PageLoader, LazyPageComponent>();

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private getPage = (loader: PageLoader): LazyPageComponent => {
    let page = pages.get(loader);
    if (!page) { page = lazy(loader); pages.set(loader, page); }
    return page;
  };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <PageState state="error" onRetry={() => { pages.clear(); this.setState({ failed: false }); }} />;
    return <PageModuleContext.Provider value={this.getPage}>{this.props.children}</PageModuleContext.Provider>;
  }
}
