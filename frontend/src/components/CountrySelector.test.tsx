import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COMING_SOON_MESSAGE } from "../lib/countries";
import CountrySelector from "./CountrySelector";

describe("CountrySelector", () => {
  it("starts on the United States", () => {
    render(<CountrySelector />);
    expect(screen.getByRole("combobox")).toHaveTextContent("United States");
  });

  it.each(["Canada", "United Kingdom", "India", "Australia", "Other countries"])("%s shows the exact Coming Soon message and keeps the US active", async (name) => {
    const user = userEvent.setup();
    render(<CountrySelector />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: new RegExp(name) }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(COMING_SOON_MESSAGE)).toBeInTheDocument();
    expect(COMING_SOON_MESSAGE).toBe("We're coming to this country soon! We're working to bring WeatherRoute to your area. For now, you can explore routes within the United States.");
    await user.click(within(dialog).getByRole("button", { name: /back to the united states/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveTextContent("United States");
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    render(<CountrySelector />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: /Canada/ }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
