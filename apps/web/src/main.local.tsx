import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LocalApp } from "./LocalApp.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><LocalApp /></StrictMode>);
