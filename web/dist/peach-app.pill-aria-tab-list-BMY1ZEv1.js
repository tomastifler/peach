(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "03c796bd-9eae-4c65-b1da-08950f5a1993", e._sentryDebugIdIdentifier = "sentry-dbid-03c796bd-9eae-4c65-b1da-08950f5a1993");
	} catch {}
})();
import { $b4f18e3395fe64d7$export$e51a686c67fdaa2d as e, PillTabList as t, __toESM as n, require_jsx_runtime as r, require_react as i, useHorizontalScroller as a } from "./peach-app.js";
// src/react/components/pill-aria-tab-list.tsx
var o = /* @__PURE__ */ n(i(), 1), s = r();
function c({ scrollable: n = !0, ...r }) {
	let [i, c] = (0, o.useState)(null), l = a(c, n);
	return /* @__PURE__ */ (0, s.jsxs)(s.Fragment, { children: [/* @__PURE__ */ (0, s.jsx)(e, {
		...r,
		ref: l,
		"data-pill-nav": ""
	}), /* @__PURE__ */ (0, s.jsx)(t, { container: i })] });
}
export { c as PillAriaTabList };

//# debugId=03c796bd-9eae-4c65-b1da-08950f5a1993