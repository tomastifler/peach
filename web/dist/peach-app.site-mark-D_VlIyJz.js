(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "49509424-7797-4eb8-a6b7-799d6dd97fc2", e._sentryDebugIdIdentifier = "sentry-dbid-49509424-7797-4eb8-a6b7-799d6dd97fc2");
	} catch {}
})();
import { __toESM as e, cc as t, require_jsx_runtime as n, require_react as r, s5 as i, siteMarkUrl as a } from "./peach-app.js";
// src/react/components/site-mark.tsx
var o = /* @__PURE__ */ e(r(), 1), s = n(), c = "size-(--icon-inline) shrink-0";
function l({ src: e }) {
	let [n, r] = (0, o.useState)("");
	return !e || n === e ? /* @__PURE__ */ (0, s.jsx)(t, {
		"aria-hidden": !0,
		className: c
	}) : /* @__PURE__ */ (0, s.jsx)("img", {
		src: e,
		alt: "",
		width: 16,
		height: 16,
		loading: "lazy",
		onError: () => r(e),
		className: `${c} rounded-none object-contain`
	});
}
function u({ source: e, linkId: t }) {
	if (e === "makers") return /* @__PURE__ */ (0, s.jsx)(i, {
		"aria-hidden": !0,
		className: c
	});
	if (t === void 0 && !e) return /* @__PURE__ */ (0, s.jsx)(l, { src: "" });
	let n = e && [
		"javten",
		"fc2ppvdb",
		"avwikidb",
		"minnano-av",
		"github"
	].includes(e);
	return /* @__PURE__ */ (0, s.jsx)(l, { src: t === void 0 ? n ? `/site-icon/${e}.png` : a({ source: e }) : `/link-mark?id=${t}` });
}
export { l as MarkImage, u as SiteMark };

//# debugId=49509424-7797-4eb8-a6b7-799d6dd97fc2