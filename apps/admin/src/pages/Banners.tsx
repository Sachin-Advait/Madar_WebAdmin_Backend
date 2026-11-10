import React, { useState } from "react";
import { History, Home } from "lucide-react";
import ContentManager from "./ContentManager";
import ReplayBanners from "./ReplayBanners";
import type { Catalog, Role } from "../types";
import "./replay-banners.css";

type Tab = "home" | "replay";
const KEY = "madar_banner_tab";
function savedTab(): Tab {
  try {
    return sessionStorage.getItem(KEY) === "replay" ? "replay" : "home";
  } catch {
    return "home";
  }
}

/** Banners: Home hero banners and Replay "featured programme" banners. */
export default function Banners({
  catalog,
  role,
}: {
  catalog: Catalog;
  role: Role;
}) {
  const [tab, setTab] = useState<Tab>(savedTab);
  function pick(next: Tab) {
    setTab(next);
    try {
      sessionStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }
  const tabs = (
    <div className="rb-tabs" role="tablist" aria-label="Banner placement">
      {(
        [
          ["home", "Home", Home],
          ["replay", "Replay", History],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={tab === id ? "active" : ""}
          onClick={() => pick(id)}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
  return tab === "replay" ? (
    <ReplayBanners role={role} tabs={tabs} />
  ) : (
    <ContentManager
      kind="featured"
      catalog={catalog}
      role={role}
      tabs={tabs}
      filter={(item) => item.placement !== "replay"}
    />
  );
}
