import { BarChart3, LayoutGrid, Lightbulb, ShieldCheck, SlidersHorizontal, Target, Timer, Users } from "lucide-react";

// The line icon of each feature row, in the order of the copy lists (loginCopy.ts, finishCopy.ts).
const SIZE = { size: 20, "aria-hidden": true } as const;
export const LOGIN_ROW_ICONS = [<BarChart3 key="a" {...SIZE} />, <Lightbulb key="b" {...SIZE} />, <Users key="c" {...SIZE} />];
export const PROFILE_ROW_ICONS = [<Lightbulb key="a" {...SIZE} />, <SlidersHorizontal key="b" {...SIZE} />, <Target key="c" {...SIZE} />];
export const CONNECT_ROW_ICONS = [<ShieldCheck key="a" {...SIZE} />, <Timer key="b" {...SIZE} />, <LayoutGrid key="c" {...SIZE} />];
