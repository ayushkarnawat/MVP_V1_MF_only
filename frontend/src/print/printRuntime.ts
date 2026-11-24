export function installPrintRuntime(): void {
  const root = document.documentElement;
  root.dataset.theme = "light";
  root.classList.remove("dark");
  root.dataset.print = "true";
  if (!document.querySelector("style[data-print-runtime]")) {
    const style = document.createElement("style");
    style.dataset.printRuntime = "";
    style.textContent = "*,*::before,*::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }";
    document.head.append(style);
  }
}
