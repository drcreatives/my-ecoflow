import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PillButton } from "./PillButton";

describe("PillButton", () => {
  it("uses button semantics and handles activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Save settings</PillButton>);

    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not activate when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PillButton onClick={onClick} disabled>
        Save settings
      </PillButton>
    );

    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
