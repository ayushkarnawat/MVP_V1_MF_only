export function textInventory(root: HTMLElement): string[] {
  const entries: string[] = [];
  const add = (text: string | null) => {
    const normalized = (text ?? "").replace(/\s+/g, " ").trim();
    if (normalized) entries.push(normalized);
  };
  const visit = (node: Node, insideFigure: boolean) => {
    if (node.nodeType === 3) {
      if (!insideFigure) add(node.textContent);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    add(element.getAttribute("aria-label"));
    add(element.getAttribute("title"));
    const figure = element.getAttribute("data-testid")?.startsWith("value-") ?? false;
    if (figure) add(element.textContent);
    element.childNodes.forEach(child => visit(child, insideFigure || figure));
  };
  visit(root, false);
  return entries.sort();
}
