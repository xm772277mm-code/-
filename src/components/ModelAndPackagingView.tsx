import React, { useState } from "react";
import ModelArchitectureView from "./ModelArchitectureView.tsx";
import PackagingView from "./PackagingView.tsx";
import CloudHostingView from "./CloudHostingView.tsx";

export default function ModelAndPackagingView() {
  const [subTab, setSubTab] = useState<"cloud" | "model" | "packaging">("cloud");

  return (
    <div>
      <div
        className="border-b px-6 py-2.5"
        style={{
          backgroundColor: "var(--nawa-sidebar)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("cloud")}
            className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: subTab === "cloud" ? "var(--nawa-accent)" : "transparent",
              color: subTab === "cloud" ? "#FFFFFF" : "var(--nawa-muted)",
            }}
          >
            الاستضافة السحابية (Firebase & Google Cloud)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("model")}
            className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: subTab === "model" ? "var(--nawa-accent)" : "transparent",
              color: subTab === "model" ? "#FFFFFF" : "var(--nawa-muted)",
            }}
          >
            معمارية النموذج الاحتياطي
          </button>
          <button
            type="button"
            onClick={() => setSubTab("packaging")}
            className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: subTab === "packaging" ? "var(--nawa-accent)" : "transparent",
              color: subTab === "packaging" ? "#FFFFFF" : "var(--nawa-muted)",
            }}
          >
            ملفات التثبيت والتصدير (DEB / RUN / PYZ / EXE / APK)
          </button>
        </div>
      </div>

      {subTab === "cloud" ? (
        <CloudHostingView />
      ) : subTab === "model" ? (
        <ModelArchitectureView />
      ) : (
        <PackagingView />
      )}
    </div>
  );
}
