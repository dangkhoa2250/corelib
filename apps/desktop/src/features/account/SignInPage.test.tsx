import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

describe("SignInPage", () => {
  it("renders email and password inputs and handles submit", () => {
    const onSubmit = vi.fn();
    const { container } = render(<SignInPage onSubmit={onSubmit} onToggleTab={vi.fn()} loading={false} error={null} />);
    expect(screen.getByRole("heading", { name: "Corelib" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    
    const submitBtn = container.querySelector('button[type="submit"]');
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith("test@example.com", "password123", false);
  });

  it("submits with remember=true when the checkbox is checked", () => {
    const onSubmit = vi.fn();
    const { container } = render(<SignInPage onSubmit={onSubmit} onToggleTab={vi.fn()} loading={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByLabelText("Remember me"));
    fireEvent.click(container.querySelector('button[type="submit"]')!);

    expect(onSubmit).toHaveBeenCalledWith("test@example.com", "password123", true);
  });
});
