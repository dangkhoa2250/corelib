import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";

describe("RegisterPage", () => {
  it("renders display name, email, password inputs and handles submit", () => {
    const onSubmit = vi.fn();
    const { container } = render(<RegisterPage onSubmit={onSubmit} onToggleTab={vi.fn()} loading={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Display Name"), { target: { value: "Mai" } });
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "mai@example.com" } });
    fireEvent.change(screen.getByLabelText("Password (min 12 chars)"), { target: { value: "password123456" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "password123456" } });
    
    const submitBtn = container.querySelector('button[type="submit"]');
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith("Mai", "mai@example.com", "password123456");
  });
});
