import { Component, type ReactNode } from "react";
import { SectionCard } from "../features/mutual-funds/common/SectionCard";
import { usePrintSettled } from "./usePrintSettled";

// One section that cannot be drawn must not blank the whole report: it prints the screens' own failure sentence in place and
// reports itself settled, so the report still becomes ready and every other section prints.
function FailedSection({ id, title }: { id: string; title: string }) {
  usePrintSettled(id, true);
  return <SectionCard title={title} state="failed" onRetry={() => {}}><span /></SectionCard>;
}

interface Props { id: string; title: string; children: ReactNode }

export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <FailedSection id={this.props.id} title={this.props.title} /> : this.props.children;
  }
}
