import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Case A: Google Maps Demo Key auth/quota failure detector (before map initializes)
const win = window as unknown as {
  gm_authFailure?: () => void;
};
const prevGmAuthFailure = win.gm_authFailure;
win.gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
  prevGmAuthFailure?.();
};

const origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  origConsoleError(...args);
  try {
    const joined = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
    if (/OverQuotaMapError|QuotaExceededError|Google Maps JavaScript API error/i.test(joined)) {
      window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
    }
  } catch {
    // ignore console tap errors
  }
};

createRoot(document.getElementById("root")!).render(<App />);
