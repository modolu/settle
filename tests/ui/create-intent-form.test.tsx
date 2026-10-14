// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateIntentForm } from "@/components/create-intent-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const RECIPIENT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function withinOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.text);
}

function fillValidForm() {
  fill(/expected amount/i, "25.00");
  fill(/recipient address/i, RECIPIENT);
  fill(/payer address/i, PAYER);
  fill(/payment window closes/i, "2030-01-01T12:00");
  fill(/external reference/i, "INV-204");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateIntentForm", () => {
  it("offers Base and Arc while keeping USDC as the fixed asset", () => {
    render(<CreateIntentForm />);
    const network = screen.getByRole("combobox", { name: /network/i }) as HTMLSelectElement;
    expect(network.value).toBe("base");
    expect(withinOptions(network)).toEqual(["Base", "Arc"]);
    expect(screen.getByText("USDC", { exact: true })).toBeTruthy();
    expect(screen.getByText("Native Circle USDC")).toBeTruthy();
  });

  it("sends the exact public request and redirects to the inspector on success", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    fetchMock.mockResolvedValue(jsonResponse({ id: "pi_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", status: "pending" }, 201));
    render(<CreateIntentForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/inspect/pi_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/v1/payment-intents");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      chain: "base",
      asset: "USDC",
      amount: "25.00",
      recipient: RECIPIENT,
      payer: PAYER,
      expiresAt: new Date("2030-01-01T12:00").toISOString(),
      externalReference: "INV-204",
      requiredConfirmations: 3,
    });
    vi.useRealTimers();
  });

  it("switches to Arc, locks deterministic finality to one, and sends the Arc request", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    fetchMock.mockResolvedValue(jsonResponse({ id: "pi_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", status: "pending" }, 201));
    render(<CreateIntentForm />);
    fireEvent.change(screen.getByRole("combobox", { name: /network/i }), { target: { value: "arc" } });
    expect(screen.getByText("Native/system settlement")).toBeTruthy();
    const confirmations = screen.getByLabelText(/confirmations/i) as HTMLInputElement;
    expect(confirmations.value).toBe("1");
    expect(confirmations.disabled).toBe(true);
    fill(/expected amount/i, "0.123456789012345678");
    fill(/recipient address/i, RECIPIENT);
    fill(/payer address/i, PAYER);
    fill(/payment window closes/i, "2030-01-01T12:00");
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      chain: "arc",
      asset: "USDC",
      amount: "0.123456789012345678",
      recipient: RECIPIENT,
      payer: PAYER,
      requiredConfirmations: 1,
    });
    vi.useRealTimers();
  });

  it("blocks obviously invalid input client-side without calling the API", async () => {
    render(<CreateIntentForm />);
    fill(/expected amount/i, "abc");
    fill(/recipient address/i, "0xnope");
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));
    await screen.findByText(/positive decimal/i);
    expect(screen.getByText(/40-character hexadecimal/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    const amount = screen.getByLabelText(/expected amount/i);
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")).toContain("error");
  });

  it("renders server validation errors on the named fields and keeps the entered values", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "expiresAt: must be at most 7 days from now", retryable: false } }, 400),
    );
    render(<CreateIntentForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));

    await screen.findByText("must be at most 7 days from now");
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/recipient address/i) as HTMLInputElement).value).toBe(RECIPIENT);
    expect((screen.getByLabelText(/external reference/i) as HTMLInputElement).value).toBe("INV-204");
    expect((screen.getByRole("button", { name: /create payment intent/i }) as HTMLButtonElement).disabled).toBe(false);
    vi.useRealTimers();
  });

  it("attaches INVALID_ADDRESS to the payer field", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "INVALID_ADDRESS", message: "payer must be a valid Base address", retryable: false } }, 400));
    render(<CreateIntentForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));
    await screen.findByText("payer must be a valid Base address");
    expect(screen.getByLabelText(/payer address/i).getAttribute("aria-invalid")).toBe("true");
    vi.useRealTimers();
  });

  it("shows a retryable upstream failure as a form-level alert, not as a field error", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Blockchain provider is temporarily unavailable", retryable: true } }, 503),
    );
    render(<CreateIntentForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /create payment intent/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Blockchain evidence unavailable");
    expect(alert.textContent).not.toContain("stack");
    vi.useRealTimers();
  });

  it("disables the submit button while the request is pending", async () => {
    vi.useFakeTimers({ now: new Date("2029-12-31T00:00:00.000Z"), toFake: ["Date"] });
    let resolve: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<CreateIntentForm />);
    fillValidForm();
    const button = screen.getByRole("button", { name: /create payment intent/i }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse({ id: "pi_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }, 201));
    await waitFor(() => expect(push).toHaveBeenCalled());
    vi.useRealTimers();
  });
});
