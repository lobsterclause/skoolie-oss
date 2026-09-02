import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "@fontsource-variable/nunito";
import "./styles.css";
import { router } from "./router.js";

// In dev, StyleX serves its compiled CSS through a virtual module with HMR; production builds inline it into the CSS asset.
if (import.meta.env.DEV) void import("virtual:stylex:runtime");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
