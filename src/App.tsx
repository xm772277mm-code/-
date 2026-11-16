import React, { useState } from "react";
import AgentWorkspaceView from "./components/AgentWorkspaceView.tsx";
import BenchmarkView from "./components/BenchmarkView.tsx";
import ModelArchitectureView from "./components/ModelArchitectureView.tsx";
import PackagingView from "./components/PackagingView.tsx";

type ActiveTab = "agent" | "benchmark" | "model" | "packaging";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("agent");

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-8 border-b border-white/10 bg-[#111827] px-6">
        {/* Zone 1: Single text element Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab("agent")}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          نواة Studio
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {[
            { id: "agent" as const, label: "الوكيل والبيئة" },
            { id: "benchmark" as const, label: "اختبار 50M/ث" },
            { id: "model" as const, label: "معمارية النموذج" },
            { id: "packaging" as const, label: "تصدير EXE و APK" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`border-b-2 py-5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("benchmark")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            اختبار السرعة
          </button>
        </div>
      </header>

      {/* Mobile Tab Selector */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#111827] px-4 py-2 md:hidden">
        {[
          { id: "agent" as const, label: "الوكيل والبيئة" },
          { id: "benchmark" as const, label: "اختبار 50M/ث" },
          { id: "model" as const, label: "النموذج" },
          { id: "packaging" as const, label: "EXE و APK" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeTab === item.id ? "bg-blue-600 text-white" : "text-slate-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Viewport */}
      <main>
        {activeTab === "agent" && <AgentWorkspaceView />}
        {activeTab === "benchmark" && <BenchmarkView />}
        {activeTab === "model" && <ModelArchitectureView />}
        {activeTab === "packaging" && <PackagingView />}
      </main>
    </div>
  );
}
