import React from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root element");
}

createRoot(root).render(
  <React.StrictMode>
    <Theme appearance="dark" accentColor="teal" grayColor="slate" radius="large">
      <App />
    </Theme>
  </React.StrictMode>,
);
