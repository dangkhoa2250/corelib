import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 400 } });
await page.goto("file:///tmp/toolbar-narrow-final.html");
await page.waitForTimeout(200);
const result = await page.evaluate(() => {
  const tb = document.querySelector(".card-rich-text-editor__toolbar");
  const widths = [489, 420, 380, 340, 310, 290, 270, 250];
  return widths.map((width) => {
    tb.style.width = width + "px";
    tb.style.flexWrap = "wrap";
    const first = tb.querySelector("button").getBoundingClientRect().top;
    const clear = [...tb.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear").getBoundingClientRect().top;
    const colors = [...tb.querySelectorAll(".card-rich-text-editor__color-control")].map((c) => Math.round(c.getBoundingClientRect().height));
    return { width, oneLine: Math.abs(first - clear) < 2, colorH: colors };
  });
});
console.log(JSON.stringify(result));
await browser.close();
