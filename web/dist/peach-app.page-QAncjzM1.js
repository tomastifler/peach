(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "6154cfed-7d6b-49aa-a48f-a25774db362c", e._sentryDebugIdIdentifier = "sentry-dbid-6154cfed-7d6b-49aa-a48f-a25774db362c");
	} catch {}
})();
import { require_jsx_runtime as e } from "./peach-app.js";
// src/react/components/page.tsx
var t = e();
function n({ children: e }) {
	return /* @__PURE__ */ (0, t.jsx)("div", {
		className: "mx-auto flex w-full max-w-board flex-col gap-8",
		children: e
	});
}
export { n as Page };

//# debugId=6154cfed-7d6b-49aa-a48f-a25774db362c