import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../../components/ui/button";

interface CategoryTabsProps {
  categories: string[];
  value: string | null;
  onChange: (category: string) => void;
}

export function CategoryTabs({ categories, value, onChange }: CategoryTabsProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  useEffect(() => {
    if (open) items.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  const close = () => { setOpen(false); button.current?.focus(); };
  const choose = (index: number) => { onChange(categories[index]); close(); };
  const openMenu = () => { setFocusIndex(Math.max(0, categories.indexOf(value ?? ""))); setOpen(true); };
  const menuKey = (event: KeyboardEvent, index: number) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFocusIndex((index + (event.key === "ArrowDown" ? 1 : -1) + categories.length) % categories.length);
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); setFocusIndex(event.key === "Home" ? 0 : categories.length - 1);
    }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(index); }
  };

  return <div className="relative flex flex-wrap items-center gap-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div role="tablist" aria-label="Equity categories" className="flex flex-wrap gap-1">
      {categories.map((category, index) => <Button key={category} type="button" size="sm"
        ref={node => { tabs.current[index] = node; }}
        role="tab" aria-selected={value === category} tabIndex={value === category || (!value && index === 0) ? 0 : -1}
        variant={value === category ? "default" : "ghost"}
        data-clickable="" data-effect="select" onClick={() => onChange(category)}
        onKeyDown={event => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
          onChange(categories[next]); tabs.current[next]?.focus();
        }}>{category}</Button>)}
    </div>
    <Button ref={button} type="button" size="sm" variant="outline" aria-label="Choose category"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      data-clickable="" data-effect="expand" onClick={() => open ? close() : openMenu()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openMenu(); }
        if (event.key === "Escape") close();
      }}>Choose category <ChevronDown aria-hidden="true" className="ml-1 h-4 w-4" /></Button>
    {open && <div id={menuId} role="menu" aria-label="Choose category" className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-1 shadow-lg">
      {categories.map((category, index) => <button key={category} type="button"
        ref={node => { items.current[index] = node; }}
        role="menuitemradio" aria-checked={value === category} tabIndex={index === focusIndex ? 0 : -1}
        data-clickable="" data-effect="select" onClick={() => choose(index)} onKeyDown={event => menuKey(event, index)}
        className="block w-full rounded-lg p-2 text-left text-sm text-[var(--ui-text)] focus:bg-[var(--ui-row-hover)]">{category}</button>)}
    </div>}
  </div>;
}
