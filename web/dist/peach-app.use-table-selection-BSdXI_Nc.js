(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "076d9335-7e0e-414a-987a-28e135eff52b", e._sentryDebugIdIdentifier = "sentry-dbid-076d9335-7e0e-414a-987a-28e135eff52b");
	} catch {}
})();
import { __toESM as e, autoResetPageIndex as t, column_getCanSort as n, column_getSortFn as r, copyInstancePropertiesWithoutMemos as i, require_react as a, skipFirstRun as o, tableMemo as s } from "./peach-app.js";
// node_modules/@tanstack/table-core/dist/features/row-sorting/createSortedRowModel.js
function c() {
	return (e) => {
		let n = e;
		return s({
			feature: "rowSortingFeature",
			table: n,
			fnName: "table.getSortedRowModel",
			memoDeps: () => [n.atoms.sorting?.get(), n.getPreSortedRowModel()],
			fn: () => l(n),
			onAfterUpdate: o(() => t(n))
		});
	};
}
function l(e) {
	let t = e.getPreSortedRowModel(), a = e.atoms.sorting?.get();
	if (!t.rows.length || !a?.length) return t;
	let o = [], s = a.filter((t) => {
		let r = e.getColumn(t.id);
		return r ? n(r) : !1;
	});
	if (!s.length) return t;
	let c = [];
	for (let t = 0; t < s.length; t++) {
		let n = s[t], i = e.getColumn(n.id);
		i && c.push({
			id: n.id,
			desc: n.desc,
			sortUndefined: i.columnDef.sortUndefined,
			invertSorting: i.columnDef.invertSorting,
			sortFn: r(i)
		});
	}
	let l = (e, t) => {
		for (let n = 0; n < c.length; n++) {
			let r = c[n], i = r.sortUndefined, a = r.desc, o = 0;
			if (i) {
				let n = e.getValue(r.id), a = t.getValue(r.id), s = n === void 0, c = a === void 0;
				if (s && c) continue;
				if (s || c) {
					if (i === "first") return s ? -1 : 1;
					if (i === "last") return s ? 1 : -1;
					o = s ? i : -i;
				}
			}
			if (o === 0 && (o = r.sortFn(e, t, r.id)), o !== 0) return a && (o *= -1), r.invertSorting && (o *= -1), o;
		}
		return e.index - t.index;
	}, u = (e) => {
		let t = e.slice();
		t.sort(l);
		let n = !1;
		for (let r = 0; r < t.length; r++) {
			let a = t[r];
			a !== e[r] && (n = !0);
			let s = o.length;
			if (o.push(a), a.subRows.length) {
				let e = u(a.subRows);
				if (e.changed) {
					let c = Object.create(Object.getPrototypeOf(a));
					i(c, a), c.subRows = e.rows, t[r] = c, o[s] = c, n = !0;
				}
			}
		}
		return {
			rows: t,
			changed: n
		};
	};
	return {
		rows: u(t.rows).rows,
		flatRows: o,
		rowsById: t.rowsById
	};
}
// src/react/components/use-table-selection.ts
var u = /* @__PURE__ */ e(a(), 1), d = /* @__PURE__ */ new Map();
function f(e) {
	let t = (0, u.useId)(), n = (0, u.useRef)(e);
	return n.current = e, (0, u.useEffect)(() => (d.set(t, () => n.current()), () => {
		d.delete(t);
	}), [t]), (0, u.useCallback)(() => {
		for (let [e, n] of d) e !== t && n();
	}, [t]);
}
export { c as createSortedRowModel, f as useTableSelection };

//# debugId=076d9335-7e0e-414a-987a-28e135eff52b