import React, { useState } from "react";
import BenchmarkView from "./BenchmarkView.tsx";
import ModelArchitectureView from "./ModelArchitectureView.tsx";
import PackagingView from "./PackagingView.tsx";
import CloudHostingView from "./CloudHostingView.tsx";

type SubTabId = "benchmark" | "packaging" | "model" | "cloud";

export default function ModelAndPackagingView() {
  const [subTab, setSubTab] = useState<SubTabId>("benchmark");

  const tabs: Array<{ id: SubTabId; label: string }> = [
    { id: "benchmark", label: "اختبار 50M+ عملية/ثانية" },
    { id: "packaging", label: "تصدير Windows (.exe) و Android (.apk)" },
    { id: "model", label: "معمارية النموذج المخصص والتدريب" },
    { id: "cloud", label: "الاستضافة وحصص الحساب" },
  ];

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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: subTab === tab.id ? "var(--nawa-accent)" : "transparent",
                color: subTab === tab.id ? "#FFFFFF" : "var(--nawa-muted)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "benchmark" && <BenchmarkView />}
      {subTab === "packaging" && <PackagingView />}
      {subTab === "model" && <ModelArchitectureView />}
      {subTab === "cloud" && <CloudHostingView />}
    </div>
  );
}
