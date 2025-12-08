import { describe, it, expect } from "vitest";
import { reorderListByIds, moveRelativeInList, sortWithPins } from "../app/lib/noteUtils";

describe("reorderListByIds", () => {
  const base = [
    { id: 1, plaintext: "a" },
    { id: 2, plaintext: "b" },
    { id: 3, plaintext: "c" },
  ];

  it("moves item by id to target id position", () => {
    const next = reorderListByIds(base, 1, 3);
    expect(next.map((n) => n.id)).toEqual([2, 3, 1]);
  });

  it("no-op when ids missing or same", () => {
    expect(reorderListByIds(base, 1, 1)).toEqual(base);
    expect(reorderListByIds(base, 9, 1)).toEqual(base);
  });
});

describe("moveRelativeInList", () => {
  const base = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ];

  it("moves up", () => {
    const next = moveRelativeInList(base, 2, "up");
    expect(next.map((n) => n.id)).toEqual([2, 1, 3]);
  });

  it("moves down", () => {
    const next = moveRelativeInList(base, 2, "down");
    expect(next.map((n) => n.id)).toEqual([1, 3, 2]);
  });

  it("ignores out-of-range", () => {
    expect(moveRelativeInList(base, 1, "up")).toEqual(base);
    expect(moveRelativeInList(base, 3, "down")).toEqual(base);
    expect(moveRelativeInList(base, 99, "down")).toEqual(base);
  });
});

describe("sortWithPins", () => {
  const notes = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ];
  const meta = {
    b: { pinned: true },
    c: { pinned: false },
  } as any;

  it("brings pinned to front and preserves relative order", () => {
    const sorted = sortWithPins(notes, meta);
    expect(sorted.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });
});
