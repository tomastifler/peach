(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "9d0f4e8f-2eb6-4f50-b907-762162370543", e._sentryDebugIdIdentifier = "sentry-dbid-9d0f4e8f-2eb6-4f50-b907-762162370543");
	} catch {}
})();
import { expandRowModel as e, getDefaultPaginationState as t, tableMemo as n } from "./peach-app.js";
// node_modules/@tanstack/table-core/dist/features/row-pagination/createPaginatedRowModel.js
function r() {
	return (e) => {
		let t = e;
		return n({
			feature: "rowPaginationFeature",
			table: t,
			fnName: "table.getPaginatedRowModel",
			memoDeps: () => [
				t.getPrePaginatedRowModel(),
				t.atoms.pagination?.get(),
				t.options.paginateExpandedRows ? void 0 : t.atoms.expanded?.get()
			],
			fn: () => i(t)
		});
	};
}
function i(n) {
	let r = n.getPrePaginatedRowModel(), i = n.atoms.pagination?.get();
	if (!r.rows.length) return r;
	let { pageSize: a, pageIndex: o } = i ?? t(), { rows: s, flatRows: c, rowsById: l } = r, u = s;
	if (a !== Infinity || o !== 0) {
		let e = a * o, t = e + a;
		u = s.slice(e, t);
	}
	let d;
	d = n.options.paginateExpandedRows ? {
		rows: u,
		flatRows: c,
		rowsById: l
	} : e(n, {
		rows: u,
		flatRows: c,
		rowsById: l
	}), d.flatRows = [];
	let f = /* @__PURE__ */ new Set(), p = (e) => {
		f.has(e.id) || (f.add(e.id), d.flatRows.push(e), e.subRows.length && e.subRows.forEach(p));
	};
	return d.rows.forEach(p), d;
}
export { r as createPaginatedRowModel };

//# debugId=9d0f4e8f-2eb6-4f50-b907-762162370543