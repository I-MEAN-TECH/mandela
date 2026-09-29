import React from "react";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failures += 1;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertThrows(fn: () => unknown, message: string) {
  try {
    fn();
    assert(false, message);
  } catch {
    assert(true, message);
  }
}

async function main() {
  const { NAV_CHILDREN, TOP_LEVEL_ICONS, TAB_HREFS, iconForChild, iconForTab, tabToHref } = await import("./navModules");
  console.log("\nNavigation contract");

  const routes = new Map<string, string[]>();
  for (const [parent, children] of Object.entries(NAV_CHILDREN)) {
    for (const child of children) {
      assert(Boolean(child.icon), `${parent} / ${child.label} has an explicit icon`);
      assert(Boolean(iconForChild(child.label)), `${parent} / ${child.label} resolves through the strict icon registry`);
      const owners = routes.get(child.href) ?? [];
      owners.push(`${parent} / ${child.label}`);
      routes.set(child.href, owners);
    }
  }

  for (const [href, owners] of routes) {
    assert(owners.length === 1, `${href} has one navigation owner; found ${owners.join(", ")}`);
  }

  const childIconKinds = new Map<unknown, string>();
  for (const [parent, children] of Object.entries(NAV_CHILDREN)) {
    for (const child of children) {
      const icon = child.icon as React.ReactElement;
      const label = `${parent} / ${child.label}`;
      const prior = childIconKinds.get(icon.type);
      assert(!prior, `${label} does not reuse ${prior ?? "another"} module icon`);
      childIconKinds.set(icon.type, label);
    }
  }

  const roleTabs = [
    "Today", "Pay", "Homework", "Messages", "Profile", "Mark", "Class",
    "Collect", "Reconcile", "Levies", "Reports", "Approve", "Insights",
    "Broadcast", "Directory", "People", "Money", "Settings", "Route",
    "Manifest", "Done", "Visitors", "Inquiries", "Calendar", "Rollcall",
    "Exeats", "Laundry", "My dorm", "Repairs", "Supplies", "My zones",
    "Issue/Return", "Catalogue", "Overdue", "Sections", "Points", "Events",
    "Department", "Marks", "Coverage",
  ];
  const iconKinds = new Map<unknown, string>();
  for (const label of roleTabs) {
    const icon = TOP_LEVEL_ICONS[label] as React.ReactElement | undefined;
    assert(Boolean(icon), `${label} has an explicit top-level icon`);
    if (!icon) continue;
    const prior = iconKinds.get(icon.type);
    assert(!prior, `${label} does not reuse ${prior ?? "another"} workflow icon`);
    iconKinds.set(icon.type, label);
  }

  const defaultTabs = [
    "Today", "Home", "Pay", "Homework", "Messages", "Profile", "Mark", "Class",
    "Collect", "Reconcile", "Levies", "Reports", "Transport", "Visitors", "Inquiries",
    "Directory", "Money", "Spend", "People", "Academics", "Operations", "Care", "Insights",
    "Settings", "Approve", "Broadcast", "Hostel", "Laundry", "Facilities", "Store", "Library",
    "Sections", "Houses", "Events", "Exams",
  ];
  for (const tab of defaultTabs) {
    const href = tabToHref(tab);
    assert(href.startsWith("/app"), `${tab} resolves to an app route`);
    assert(Object.hasOwn(TAB_HREFS, tab), `${tab} has an explicit route owner`);
  }
  assertThrows(() => tabToHref("Unknown tenant module"), "unknown tabs cannot create a guessed, broken route");

  const defaultIconKinds = new Map<unknown, string>();
  for (const tab of [...new Set([...roleTabs, ...defaultTabs])]) {
    const icon = TOP_LEVEL_ICONS[tab] as React.ReactElement | undefined;
    assert(Boolean(icon), `${tab} has an explicit active-role icon`);
    assert(Boolean(iconForTab(tab)), `${tab} never uses a generic icon fallback`);
    if (!icon) continue;
    const prior = defaultIconKinds.get(icon.type);
    assert(!prior, `${tab} does not share ${prior ?? "another"} active-role icon`);
    defaultIconKinds.set(icon.type, tab);
  }

  if (failures) process.exitCode = 1;
  else console.log("Navigation contract passed.");
}

void main();
