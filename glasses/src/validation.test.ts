import { describe, expect, it } from "vitest";
import { validatePairingForm } from "./validation.js";

describe("pairing form validation", () => {
  it("accepts a well-formed relay URL and pairing code", () => {
    expect(
      validatePairingForm({
        relayBaseUrl: "https://relay.example.com/",
        pairingCode: "abcd-2345",
        deviceDisplayName: "Jon's G2"
      })
    ).toEqual({
      ok: true,
      value: {
        relayBaseUrl: "https://relay.example.com",
        pairingCode: "ABCD-2345",
        deviceDisplayName: "Jon's G2"
      }
    });
  });

  it("rejects URL-like strings in the pairing code field", () => {
    const result = validatePairingForm({
      relayBaseUrl: "https://relay.example.com",
      pairingCode: "https://relay.example.com",
      deviceDisplayName: "Jon's G2"
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        pairingCode: "This looks like a relay URL. Paste it into the Relay URL field."
      }
    });
  });

  it("rejects token-like strings in the pairing code field", () => {
    const result = validatePairingForm({
      relayBaseUrl: "https://relay.example.com",
      pairingCode: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      deviceDisplayName: "Jon's G2"
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        pairingCode: "This looks like a token. Pair with a short code or QR scan instead."
      }
    });
  });
});
