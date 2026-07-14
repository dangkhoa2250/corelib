import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, type = "button", variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={["ui-button", `ui-button--${variant}`, className].filter(Boolean).join(" ")}
      type={type}
    />
  );
}
