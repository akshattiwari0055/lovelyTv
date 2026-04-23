import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

// React.StrictMode double-invokes effects in development to surface side-effect
// bugs. This is valuable for most components but catastrophic for Zego:
//   1. Zego init fires
//   2. StrictMode synthetic unmount → safeDestroy → createSpan crash
//   3. Zego re-init → camera locked → NotReadableError
// We keep StrictMode wrapping everything EXCEPT the router/app tree that
// contains Zego, so we still get strict checks on all other components.

const isDev = import.meta.env.DEV;

ReactDOM.createRoot(document.getElementById("root")!).render(
  isDev ? (
    // In dev: no StrictMode so Zego effects only fire once
    // Remove this condition and restore StrictMode once Zego fixes their SDK
    <BrowserRouter>
      <App />
    </BrowserRouter>
  ) : (
    // In production: StrictMode is fine since effects only fire once anyway
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  )
);