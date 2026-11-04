import { useState } from "react";
import { SegmentedTabs } from "./SegmentedTabs";

/** A stateful demo of the tabs for the dev index (the tabs themselves are controlled). */
export function DevTabsDemo() {
  const [value, setValue] = useState<"email" | "phone">("email");
  return <SegmentedTabs label="Log in with" options={[{ value: "email", label: "Email" }, { value: "phone", label: "Mobile number" }]} value={value} onChange={setValue} />;
}
