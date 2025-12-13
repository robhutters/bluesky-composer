import { describe, it, expect } from "vitest";
import { dataUrlSizeBytes } from "../../11ty-robhutters/app/lib/imageUtils";

describe("imageUtils", () => {
  it("estimates base64 dataUrl size", () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5JdNsAAAAASUVORK5CYII=";
    const size = dataUrlSizeBytes(tinyPng);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(5000);
  });
});
