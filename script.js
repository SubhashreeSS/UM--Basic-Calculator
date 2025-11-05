document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const resultEl = document.getElementById("result");
  const recentEl = document.getElementById("recentOps");
  const buttonsEl = document.querySelector(".buttons");
  const themeBtn = document.getElementById("theme-btn");
  const body = document.body;

  // State
  let expression = ""; // current typed expression (like "12+5*3")
  let lastResult = null; // last evaluated number
  let memory = 0; // memory register
  let history = []; // recent operations (strings), newest first
  const MAX_HISTORY = 6;

  // --- Utility helpers ---
  const safeEval = (expr) => {
    // sanitize: allow digits, parentheses, dot, spaces and +-*/ operators
    const cleaned = expr.replace(/\s+/g, "");
    if (cleaned === "") return 0;
    if (/[^0-9+\-*/().]/.test(cleaned)) {
      throw new Error("Invalid characters in expression");
    }
    // use Function constructor for evaluation
    const raw = Function(`"use strict"; return (${cleaned});`)();
    if (typeof raw !== "number" || !isFinite(raw))
      throw new Error("Invalid result");
    return +round(raw, 12); // limit to 12 decimal places
  };

  const round = (num, places = 12) => {
    const p = Math.pow(10, places);
    return Math.round((num + Number.EPSILON) * p) / p;
  };

  const updateDisplay = () => {
    if (expression === "") {
      resultEl.textContent = lastResult === null ? "0" : String(lastResult);
    } else {
      resultEl.textContent = expression;
    }
    recentEl.textContent = history.join("\n");
  };

  const pushHistory = (expr, value) => {
    const entry = `${expr} = ${value}`;
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.pop();
    recentEl.textContent = history.join("\n");
  };

  // Find last operator index (+ - * /) to isolate the last number segment
  const lastOperatorIndex = (expr) => {
    const i1 = expr.lastIndexOf("+");
    const i2 = expr.lastIndexOf("-");
    const i3 = expr.lastIndexOf("*");
    const i4 = expr.lastIndexOf("/");
    return Math.max(i1, i2, i3, i4);
  };

  // Get numeric value currently shown (tries to evaluate expression if possible)
  const getCurrentNumericValue = () => {
    if (expression.trim() === "") {
      return lastResult === null ? 0 : lastResult;
    }
    // Try to evaluate the whole expression; if fails, try to parse the last number
    try {
      return safeEval(expression);
    } catch {
      // parse last number segment
      const idx = lastOperatorIndex(expression);
      const segment = expression.slice(idx + 1).trim();
      const num = parseFloat(segment);
      return Number.isFinite(num) ? num : 0;
    }
  };

  // --- Action handlers ---
  window.appendValue = (val) => {
    // Called from HTML onclick and keyboard events
    if (val === "±") {
      toggleSign();
      return;
    }
    if (val === "%") {
      applyPercent();
      return;
    }
    if (val === ".") {
      // avoid multiple decimals in the current number
      const idx = lastOperatorIndex(expression);
      const lastNum = expression.slice(idx + 1);
      if (!lastNum.includes(".")) {
        expression += ".";
      }
      updateDisplay();
      return;
    }
    if (["+", "-", "*", "/"].includes(val)) {
      // don't append operator twice; allow negative numbers like "5*-3" by replacing if last is operator
      if (expression === "" && lastResult !== null) {
        expression = String(lastResult) + val;
      } else if (expression === "") {
        // if expression empty and user presses '-' allow starting negative
        if (val === "-") expression = "-";
      } else {
        const lastChar = expression.slice(-1);
        if (["+", "-", "*", "/"].includes(lastChar)) {
          // replace last operator with new one (except allow sequence like "*-" if user explicitly typed "-")
          // If lastChar is operator and new operator is '-' and previous char isn't operator, allow as unary minus:
          if (!(val === "-" && !isNaN(Number(expression.slice(-2, -1))))) {
            expression = expression.slice(0, -1) + val;
          } else {
            expression += val;
          }
        } else {
          expression += val;
        }
      }
      updateDisplay();
      return;
    }
    // digits (0-9)
    if (/^\d$/.test(val)) {
      // avoid leading zeros in a fresh number segment
      const idx = lastOperatorIndex(expression);
      const lastNum = expression.slice(idx + 1);
      if (lastNum === "0") {
        // replace leading zero (so 0 -> 5 becomes 5)
        expression = expression.slice(0, idx + 1) + val;
      } else {
        expression += val;
      }
      updateDisplay();
      return;
    }
  };

  window.clearDisplay = () => {
    expression = "";
    lastResult = null;
    updateDisplay();
  };

  window.calculate = () => {
    const exprToEval = expression.trim();
    if (exprToEval === "" && lastResult !== null) {
      // nothing to do, show last result
      updateDisplay();
      return;
    }
    if (exprToEval === "") return;
    try {
      const val = safeEval(exprToEval);
      pushHistory(exprToEval, val);
      lastResult = val;
      expression = ""; // reset expression after result
      updateDisplay();
    } catch (err) {
      resultEl.textContent = "Error";
      console.warn("Calc error:", err);
      // keep expression intact so user can correct
      setTimeout(updateDisplay, 800);
    }
  };

  const toggleSign = () => {
    if (expression.trim() === "") {
      // toggle lastResult if present
      if (lastResult !== null) {
        lastResult = -lastResult;
      } else {
        expression = "-";
      }
      updateDisplay();
      return;
    }
    const idx = lastOperatorIndex(expression);
    const prefix = expression.slice(0, idx + 1); // includes operator if any
    let segment = expression.slice(idx + 1);
    if (segment === "") {
      // nothing typed yet after operator: add unary minus
      expression += "-";
      updateDisplay();
      return;
    }
    // If segment already starts with a minus sign (unary), remove it: "5+-3" -> "5+3"
    if (segment.startsWith("-")) {
      segment = segment.slice(1);
    } else {
      segment = "-" + segment;
    }
    expression = prefix + segment;
    updateDisplay();
  };

  const applyPercent = () => {
    if (expression.trim() === "") {
      // percent of lastResult
      if (lastResult !== null) {
        lastResult = lastResult / 100;
        updateDisplay();
      }
      return;
    }
    const idx = lastOperatorIndex(expression);
    const prefix = expression.slice(0, idx + 1);
    const segment = expression.slice(idx + 1);
    if (!segment) return;
    const num = parseFloat(segment);
    if (!Number.isFinite(num)) return;
    const replaced = String(num / 100);
    expression = prefix + replaced;
    updateDisplay();
  };

  // --- Memory operations ---
  function handleMemory(action) {
    // action: 'M+' 'M-' 'MR' 'MC'
    try {
      const current = getCurrentNumericValue();
      if (action === "M+") {
        memory = round(memory + current, 12);
      } else if (action === "M-") {
        memory = round(memory - current, 12);
      } else if (action === "MR") {
        // recall memory into current input (replace expression)
        expression = String(memory);
      } else if (action === "MC") {
        memory = 0;
      }
      // small UI feedback: update display & show memory state in history top
      pushHistory(`Memory ${action}`, memory);
      updateDisplay();
    } catch (err) {
      console.warn("Memory op failed", err);
    }
  }

  // --- Create memory buttons dynamically and put them at the beginning of the .buttons grid
  const createMemoryButtons = () => {
    const labels = ["M+", "M-", "MR", "MC"];
    // Insert in reverse order so final order is labels[0..3] at top-left to top-right
    for (let i = labels.length - 1; i >= 0; i--) {
      const btn = document.createElement("button");
      btn.className = "op mem"; // use operator style to make them stand out
      btn.type = "button";
      btn.textContent = labels[i];
      btn.addEventListener("click", () => handleMemory(labels[i]));
      buttonsEl.insertBefore(btn, buttonsEl.firstChild);
    }
  };

  // --- Theme toggle ---
  const initTheme = () => {
    const stored = localStorage.getItem("calc-theme");
    if (stored === "dark") {
      body.classList.add("dark");
      themeBtn.classList.add("dark");
    }
    themeBtn.addEventListener("click", () => {
      body.classList.toggle("dark");
      themeBtn.classList.toggle("dark");
      localStorage.setItem(
        "calc-theme",
        body.classList.contains("dark") ? "dark" : "light"
      );
    });
  };

  // --- Keyboard support ---
  const keyMap = {
    Enter: "=", // treat Enter as equals
    "=": "=",
    Backspace: "Backspace",
    Escape: "C", // Escape = clear
  };

  window.addEventListener("keydown", (e) => {
    // avoid interfering when user types in other inputs (none in this UI, but safe)
    if (
      e.target &&
      (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
    )
      return;
    const k = e.key;
    if (/\d/.test(k)) {
      appendValue(k);
      e.preventDefault();
      return;
    }
    if (k === ".") {
      appendValue(".");
      e.preventDefault();
      return;
    }
    if (k === "+" || k === "-" || k === "*" || k === "/") {
      appendValue(k);
      e.preventDefault();
      return;
    }
    if (k === "Enter" || k === "=") {
      calculate();
      e.preventDefault();
      return;
    }
    if (k === "Backspace") {
      // emulate a backspace on expression
      if (expression.length > 0) {
        expression = expression.slice(0, -1);
        updateDisplay();
      } else {
        // if nothing, clear lastResult
        lastResult = null;
        updateDisplay();
      }
      e.preventDefault();
      return;
    }
    if (k === "Escape") {
      clearDisplay();
      e.preventDefault();
    }
  });

  // --- Initialization ---
  createMemoryButtons();
  initTheme();
  updateDisplay();

  // Expose a couple of helpers to global for the HTML onclick handlers to use:
  window.calculate = window.calculate.bind(window);
  window.clearDisplay = window.clearDisplay.bind(window);
  window.appendValue = window.appendValue.bind(window);
});
