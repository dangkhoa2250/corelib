import type { ReactNode } from "react";
import { ScrollArea } from "../../../components/ScrollArea";

interface StatisticsShellProps {
  title: string;
  onBack?: () => void;
  children?: ReactNode;
}

export function StatisticsShell({ title, onBack, children }: StatisticsShellProps) {
  return (
    <div className="statistics-shell">
      {onBack && (
        <button onClick={onBack}>Back</button>
      )}
      <h1>{title}</h1>
      <ScrollArea data-testid="statistics-scroll-area">
        <div
          data-testid="statistics-scroll-content"
          className="statistics-shell__content"
          style={{ padding: "28px 20px 40px 28px" }}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
