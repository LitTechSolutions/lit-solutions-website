import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";
import "./styles/app-shell.css";
import "./styles/auth.css";

const container = document.getElementById("root");
if (!container) throw new Error("main.tsx: #root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
