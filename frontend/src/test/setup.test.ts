import { describe, expect, it } from "vitest";

describe("test ortamı", () => {
  it("jsdom ve jest-dom eşleştiricileri çalışır", () => {
    document.body.innerHTML = "<p>merhaba</p>";
    expect(document.querySelector("p")).toHaveTextContent("merhaba");
  });
});
