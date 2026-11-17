import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: "var(--nawa-bg)", color: "var(--nawa-text)" }}>
          <div className="max-w-md rounded-2xl border p-6 text-center" style={{ backgroundColor: "var(--nawa-surface)", borderColor: "var(--nawa-border)" }}>
            <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
            <p className="mt-2 text-sm opacity-80">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
