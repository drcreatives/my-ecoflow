import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("reports the next checked state when activated", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Toggle checked={false} onToggle={onToggle} label="AC output" />);

    await user.click(screen.getByRole("checkbox", { name: "AC output" }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("does not activate while disabled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <Toggle checked={false} onToggle={onToggle} label="DC output" disabled />
    );

    await user.click(screen.getByRole("checkbox", { name: "DC output" }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
