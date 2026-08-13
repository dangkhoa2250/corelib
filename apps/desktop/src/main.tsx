import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./app/app.css";
import "./features/settings/settings.css";
import "./features/library/library.css";
import "./features/memora/memora.css";
import "./features/cards/cards.css";
import "./features/reader/reader.css";
import "./features/review/review.css";
import "./features/search/search.css";
import "./features/drive/drive.css";
import "./features/statistics/statistics.css";
import "pdfjs-dist/web/pdf_viewer.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
