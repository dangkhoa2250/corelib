import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 860, height: 1000 } });
await page.goto("file:///tmp/modal-v3-final.html");
await page.waitForTimeout(200);
const info = await page.evaluate(() => {
  const modal = document.querySelector(".modal");
  const fields = modal.children[1];
  const footer = modal.children[2];
  const grid = modal.children[3];
  const m = modal.getBoundingClientRect();
  const f = fields.getBoundingClientRect();
  const ft = footer.getBoundingClientRect();
  const g = grid.getBoundingClientRect();
  return {
    modalH: Math.round(m.height),
    fieldsH: Math.round(f.height),
    footerTop: Math.round(ft.top - m.top),
    gridTop: Math.round(g.top - m.top),
    gridBottom: Math.round(g.bottom - m.top),
    gridBelowFooter: g.top >= ft.bottom - 1,
    gridScrolls: getComputedStyle(grid.querySelector(".grid-scroll")).overflow === "hidden",
    fieldsOverflow: getComputedStyle(fields).overflowY,
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/tmp/modal-v3-shot.png" });
await browser.close();
