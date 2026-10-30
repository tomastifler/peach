(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "cf9fe502-e46c-4f37-a8b5-bb57a7442240", e._sentryDebugIdIdentifier = "sentry-dbid-cf9fe502-e46c-4f37-a8b5-bb57a7442240");
	} catch {}
})();
import { createPaginatedRowModel as e } from "./peach-app.createPaginatedRowModel-ClHnhG_T.js";
import { $76d00c5a4edb230a$export$76ccd210b9029917 as t, $76d00c5a4edb230a$export$816b5d811295e6bc as n, $76d00c5a4edb230a$export$b59bdbef9ce70de2 as r, $76d00c5a4edb230a$export$f6f0c3fe4ec306ea as i, $76d00c5a4edb230a$export$f850895b287ef28e as ee, $ea3928288112382f$export$439d29a4e110a164 as a, Button as o, Bx as te, COLUMN_SORT as s, Checkbox as c, ChevronSortDown as ne, CollapseChevron as re, CollapseRegion as l, DataTableFooter as ie, DataTableFrame as u, EmptyState as d, FOLLOW_CHECK_KEY as f, LAYOUTS as ae, M6 as oe, Note as p, SORT_DEFAULT_DIR as se, SORT_OPTIONS as ce, Select as le, SelectItem as ue, SelectionDock as de, SortDirectionIcon as fe, Switch as pe, Table as me, TableColumnControls as he, TableColumnResizer as ge, TableSelectionHeader as _e, TaskProgress as ve, Un as ye, __toESM as m, authorGroups as be, authorName as xe, busyProps as h, cardClass as Se, checkEvidenceGap as Ce, checkFailures as we, checkReceipt as Te, checkSummary as Ee, checkedText as De, clickedBlank as g, columnVisibilityFeature as Oe, confirmModal as _, createColumnHelper as ke, dZ as v, dropSources as Ae, du as je, errorHeadline as Me, errorMessage as y, fetchCheckJob as Ne, fetchPending as Pe, flexRender as Fe, isBroken as Ie, l7 as b, mapLimit as Le, markItem as Re, pageWindow as ze, patchSource as Be, reloadFollowManage as Ve, removeSource as He, require_jsx_runtime as x, require_react as S, rowPaginationFeature as C, rowSelectionFeature as Ue, rowSortingFeature as w, selectionState as We, setSourceEnabled as Ge, sortLabel as Ke, startCheck as qe, tableFeatures as Je, tableRows as Ye, toggleGroup as T, useBackgroundJob as Xe, useMutation as E, useTable as Ze, useTablePreferences as Qe } from "./peach-app.js";
import { AuthorAvatar as $e, ErrorLine as et, SourceIcon as D, SourceLink as tt, StatusBadge as nt } from "./peach-app.source-view-DalWfDkm.js";
// src/react/follow-manage/source-list.tsx
var O = /* @__PURE__ */ m(S(), 1), k = x(), rt = Je({
	rowPaginationFeature: C,
	rowSelectionFeature: Ue,
	rowSortingFeature: w,
	columnVisibilityFeature: Oe,
	paginatedRowModel: e()
}), A = (e) => (Number(e) || 0).toLocaleString(), it = Object.fromEntries(Object.entries(s).map(([e, t]) => [t, e])), j = 740;
function at() {
	let [e, t] = (0, O.useState)(!1), n = (0, O.useRef)(null), r = (0, O.useCallback)((e) => {
		if (n.current?.disconnect(), !e) {
			n.current = null;
			return;
		}
		let r = new ResizeObserver(() => t(e.clientWidth < j));
		r.observe(e), n.current = r, t(e.clientWidth < j);
	}, []);
	return (0, O.useEffect)(() => () => n.current?.disconnect(), []), [r, e];
}
var ot = {
	select: "选择",
	author: "创作者",
	source: "来源",
	provider: "站点",
	status: "状态",
	checked: "上次检查",
	actions: "操作"
}, st = Object.entries(ot).map(([e, t]) => ({
	id: e,
	label: t,
	width: e === "select" ? 48 : e === "source" ? 320 : e === "author" ? 240 : e === "actions" ? 208 : 184,
	min: e === "select" ? 48 : e === "actions" ? 200 : e === "source" ? 320 : 112,
	max: e === "select" ? 48 : e === "source" ? 2e3 : 800,
	flex: e === "source",
	required: e === "select" || e === "source"
}));
function M({ source: e, selected: t, onToggle: n, handlers: r }) {
	return /* @__PURE__ */ (0, k.jsxs)("div", {
		"data-selected": t || void 0,
		"data-follow-source-row": "",
		className: "flex min-h-16 flex-wrap items-center gap-3 px-2 py-3 last:rounded-b-lg max-sm:gap-x-2",
		onClick: (e) => {
			g(e, e.currentTarget) && n(!t);
		},
		children: [
			/* @__PURE__ */ (0, k.jsx)(c, {
				isSelected: t,
				onChange: n,
				"aria-label": `选择 ${e.label}`
			}),
			/* @__PURE__ */ (0, k.jsxs)("span", {
				className: "flex min-w-0 grow basis-0 items-center gap-1.5",
				children: [/* @__PURE__ */ (0, k.jsx)("span", {
					"data-follow-source-site": "",
					className: "flex shrink-0 items-center text-body-medium",
					children: /* @__PURE__ */ (0, k.jsx)(D, { provider: e.provider })
				}), /* @__PURE__ */ (0, k.jsx)(tt, { source: e })]
			}),
			/* @__PURE__ */ (0, k.jsx)(a, { children: e.provider_label }),
			/* @__PURE__ */ (0, k.jsx)(nt, { source: e }),
			e.last_error ? /* @__PURE__ */ (0, k.jsxs)("span", {
				"data-follow-source-error": "",
				className: "flex min-w-0 basis-full gap-3 max-sm:gap-x-2 sm:order-last",
				children: [/* @__PURE__ */ (0, k.jsx)("span", {
					"aria-hidden": !0,
					className: "w-4 shrink-0"
				}), /* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex min-w-0 grow gap-1.5",
					children: [/* @__PURE__ */ (0, k.jsx)("span", {
						"aria-hidden": !0,
						className: "w-(--icon-inline) shrink-0 text-body-medium"
					}), /* @__PURE__ */ (0, k.jsx)("span", {
						className: "min-w-0 grow",
						children: /* @__PURE__ */ (0, k.jsx)(et, { text: e.last_error })
					})]
				})]
			}) : null,
			/* @__PURE__ */ (0, k.jsxs)("span", {
				"data-follow-source-controls": "",
				className: "flex w-max max-w-full flex-none flex-wrap items-center gap-1.5 max-sm:w-full",
				children: [
					/* @__PURE__ */ (0, k.jsx)("span", {
						className: "shrink-0 text-body-2-regular whitespace-nowrap text-text-secondary max-sm:mr-auto max-sm:text-caption-1-regular",
						children: De(e)
					}),
					/* @__PURE__ */ (0, k.jsx)(pe, {
						"aria-label": `启用 ${e.label}`,
						isSelected: e.enabled,
						isDisabled: r.readOnly,
						onChange: (t) => r.toggle(e, t)
					}),
					/* @__PURE__ */ (0, k.jsxs)("span", {
						className: "flex shrink-0 items-center gap-1",
						children: [/* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							iconOnly: !0,
							leadingIcon: v,
							"aria-label": `检查 ${e.label} 的更新`,
							disabled: !e.enabled || r.readOnly,
							...h(r.busy),
							onClick: () => r.check([e.id])
						}), /* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							iconOnly: !0,
							leadingIcon: oe,
							"aria-label": `移除 ${e.label}`,
							disabled: r.readOnly,
							onClick: () => r.remove(e)
						})]
					})
				]
			})
		]
	});
}
function ct({ group: e, name: t, open: n, selected: r, handlers: i, onOpen: ee, onToggleGroup: te, onToggle: s }) {
	let c = e.map((e) => e.id), ne = e.filter((e) => e.enabled).map((e) => e.id), ie = e.filter(Ie).length, u = [...new Set(e.map((e) => e.provider_label || e.provider))].join("、"), d = `follow-author-${e[0].id}`, f = We(r, c);
	return /* @__PURE__ */ (0, k.jsxs)("section", {
		"aria-label": `${t} 的关注来源`,
		className: Se({
			variant: "raised",
			padding: "none",
			className: "flex flex-col overflow-hidden p-2"
		}),
		children: [/* @__PURE__ */ (0, k.jsxs)("div", {
			"data-follow-author-header": !0,
			"data-open": n || void 0,
			className: "flex flex-wrap items-center gap-3 px-2 py-2.5",
			children: [
				/* @__PURE__ */ (0, k.jsx)($e, {
					group: e,
					name: t
				}),
				/* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex min-w-0 grow basis-0 flex-col gap-1",
					children: [/* @__PURE__ */ (0, k.jsx)("b", {
						className: "min-w-0 text-body-medium wrap-anywhere text-text-primary",
						children: t
					}), /* @__PURE__ */ (0, k.jsxs)("span", {
						"data-follow-author-sites": "",
						className: "flex min-w-0 flex-wrap items-center gap-1 text-body-2-regular",
						title: u,
						children: [
							e.map((e) => /* @__PURE__ */ (0, k.jsx)(D, { provider: e.provider }, e.id)),
							/* @__PURE__ */ (0, k.jsx)(a, { children: `来源：${u}` }),
							ie ? /* @__PURE__ */ (0, k.jsx)("span", {
								className: "ml-1 shrink-0 text-text-error-primary",
								children: `${ie} 个失败`
							}) : null
						]
					})]
				}),
				/* @__PURE__ */ (0, k.jsxs)("span", {
					"data-follow-author-controls": "",
					className: "flex flex-none items-center gap-2 max-sm:w-full max-sm:justify-end",
					children: [/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						iconOnly: !0,
						leadingIcon: v,
						"aria-label": `检查 ${t} 的全部来源`,
						disabled: !ne.length || i.readOnly,
						...h(i.busy),
						onClick: () => i.check(ne)
					}), /* @__PURE__ */ (0, k.jsxs)("span", {
						className: "flex flex-none items-center gap-2",
						children: [/* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							leadingIcon: b,
							"aria-pressed": f.all ? "true" : f.some ? "mixed" : "false",
							"aria-label": `${f.all ? "取消全选" : "全选"} ${t} 的来源`,
							onClick: () => te(!f.all),
							children: f.all ? "取消全选" : "全选"
						}), /* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							"aria-expanded": n,
							"aria-controls": d,
							leadingIcon: re,
							"aria-label": `${n ? "收起" : "展开"} ${t} 的来源`,
							onClick: () => ee(!n),
							children: n ? "收起" : "展开"
						})]
					})]
				})
			]
		}), /* @__PURE__ */ (0, k.jsx)(l, {
			id: d,
			open: n,
			"data-source-divider": !0,
			children: e.map((e) => /* @__PURE__ */ (0, k.jsx)(M, {
				source: e,
				handlers: i,
				selected: r.has(e.id),
				onToggle: (t) => s(e.id, t)
			}, e.id))
		})]
	});
}
function lt(e) {
	let { data: l, sort: m, dir: g, page: Oe, layout: Ie, pageSize: b, selected: x, readOnly: S, onSort: C, onPage: Ue, onLayout: w, onPageSize: Je, onSelected: j, toast: M, openFollow: lt, onAdd: ut } = e, N = l.sources, P = (0, O.useMemo)(() => l.author_aliases || [], [l.author_aliases]), F = l.counts || {}, [I, dt] = (0, O.useState)(/* @__PURE__ */ new Set()), [ft, pt] = at(), [mt, L] = (0, O.useState)(""), R = (0, O.useMemo)(() => be(N, m, g, P), [
		N,
		m,
		g,
		P
	]), ht = (0, O.useMemo)(() => Ye(R, m, g, P), [
		R,
		m,
		g,
		P
	]), { job: z, running: B, outcome: V, start: gt } = Xe({
		queryKey: f,
		queryFn: ({ signal: e }) => Ne(e),
		start: (e) => qe(e),
		onError: (e) => L(y(e)),
		onFinish: (e) => {
			Ve(), M(e.status === "failed" ? e.error || "检查失败" : Te(e));
		}
	}), H = (e) => {
		B || gt.isPending || (L(""), gt.mutate(e));
	}, _t = (e, t) => j(T(x, [e], t)), vt = (e, t) => j(T(x, e, t)), yt = E({
		mutationFn: (e) => He(e),
		onSuccess: (e, t) => {
			Ae([t]), j(T(x, [t], !1)), M("已取消关注来源");
		},
		onError: (e) => L(y(e))
	}), bt = E({
		mutationFn: (e) => Ge(e.id, e.enabled),
		onSuccess: (e, t) => {
			Be(t.id, { enabled: t.enabled }), L("");
		},
		onError: (e) => L(y(e))
	}), xt = (e) => void _({
		title: "取消关注来源",
		body: "将移除这个来源及已抓取的条目，媒体文件保留。",
		confirmLabel: "取消关注来源",
		danger: !0,
		onConfirm: () => yt.mutateAsync(e.id)
	}), U = E({
		mutationFn: async (e) => {
			let t = await Le(e.ids, 4, async (t) => {
				e.action === "remove" ? await He(t) : await Ge(t, e.action === "enabled");
			});
			return {
				...e,
				done: e.ids.filter((e, n) => t[n]?.ok),
				results: t
			};
		},
		onSuccess: (e) => {
			if (e.action === "remove") Ae(e.done);
			else for (let t of e.done) Be(t, { enabled: e.action === "enabled" });
			j(T(x, e.done, !1));
			let t = e.results.filter((e) => !e.ok);
			if (t.length) {
				L(`${t.length}/${e.ids.length} 个来源未更新：${y(t[0]?.error)}`);
				return;
			}
			L("");
			let n = e.action === "remove" ? "删除" : e.action === "enabled" ? "启用" : "暂停";
			M(`已${n} ${e.done.length} 个关注来源`);
		},
		onError: (e) => L(y(e))
	}), W = E({
		mutationFn: async (e) => {
			let t = ((await Pe()).groups || []).flatMap((e) => [
				e.primary,
				...e.variants,
				...e.duplicates
			]).filter((e) => e.status === "new").map((e) => e.id);
			return {
				ids: t,
				failed: (await Le(t, 6, (t) => Re(t, e))).filter((e) => !e.ok)
			};
		},
		onSuccess: (e) => {
			Ve(), e.failed.length ? L(`批量更新 ${e.failed.length}/${e.ids.length} 项未完成`) : (L(""), M(`已批量标记 ${e.ids.length} 项`));
		},
		onError: (e) => L(y(e))
	}), St = (e, t) => bt.mutate({
		id: e.id,
		enabled: t
	}), G = (0, O.useRef)({
		check: H,
		toggle: St,
		remove: xt,
		busy: !1,
		readOnly: S
	});
	G.current = {
		check: H,
		toggle: St,
		remove: xt,
		busy: B || gt.isPending,
		readOnly: S
	};
	let K = G.current, Ct = (0, O.useMemo)(() => {
		let e = ke(), t = (e) => () => ot[e] || e;
		return e.columns([
			e.display({
				id: "select",
				header: (e) => /* @__PURE__ */ (0, k.jsx)(_e, {
					table: e.table,
					label: "全选本页来源",
					page: !0
				}),
				cell: (e) => /* @__PURE__ */ (0, k.jsx)(c, {
					slot: null,
					isSelected: e.row.getIsSelected(),
					onChange: (t) => e.row.toggleSelected(t),
					"aria-label": `选择 ${e.row.original.source.label}`
				})
			}),
			e.accessor((e) => e.author, {
				id: "author",
				header: t("author"),
				cell: (e) => /* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex min-w-0 items-center gap-2",
					children: [/* @__PURE__ */ (0, k.jsx)($e, {
						group: e.row.original.group,
						name: e.row.original.author
					}), /* @__PURE__ */ (0, k.jsx)("span", {
						className: "min-w-0 break-words",
						children: e.row.original.author
					})]
				})
			}),
			e.accessor((e) => e.source.label, {
				id: "source",
				header: t("source"),
				cell: (e) => /* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex min-w-0 flex-col gap-0.5",
					children: [/* @__PURE__ */ (0, k.jsx)(tt, { source: e.row.original.source }), e.row.original.source.last_error ? /* @__PURE__ */ (0, k.jsx)(et, { text: e.row.original.source.last_error }) : null]
				})
			}),
			e.accessor((e) => e.source.provider_label, {
				id: "provider",
				header: t("provider"),
				cell: (e) => /* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, k.jsx)(D, { provider: e.row.original.source.provider }), e.row.original.source.provider_label]
				})
			}),
			e.display({
				id: "status",
				header: t("status"),
				cell: (e) => /* @__PURE__ */ (0, k.jsx)(nt, { source: e.row.original.source })
			}),
			e.accessor((e) => e.source.last_checked_at || "", {
				id: "checked",
				header: t("checked"),
				cell: (e) => De(e.row.original.source)
			}),
			e.display({
				id: "actions",
				header: t("actions"),
				cell: (e) => /* @__PURE__ */ (0, k.jsxs)("span", {
					className: "flex items-center gap-1",
					children: [
						/* @__PURE__ */ (0, k.jsx)(pe, {
							"aria-label": `启用 ${e.row.original.source.label}`,
							isSelected: e.row.original.source.enabled,
							isDisabled: K.readOnly,
							onChange: (t) => G.current.toggle(e.row.original.source, t)
						}),
						/* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							iconOnly: !0,
							leadingIcon: v,
							"aria-label": `检查 ${e.row.original.source.label} 的更新`,
							disabled: !e.row.original.source.enabled || K.readOnly,
							...h(K.busy),
							onClick: () => G.current.check([e.row.original.source.id])
						}),
						/* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							size: "small",
							iconOnly: !0,
							leadingIcon: oe,
							"aria-label": `移除 ${e.row.original.source.label}`,
							disabled: K.readOnly,
							onClick: () => G.current.remove(e.row.original.source)
						})
					]
				})
			})
		]);
	}, [K]), q = (0, O.useMemo)(() => {
		let e = it[m];
		return e ? [{
			id: e,
			desc: g === "desc"
		}] : [];
	}, [m, g]), wt = (0, O.useMemo)(() => Object.fromEntries([...x].map((e) => [String(e), !0])), [x]), J = Ie === "table", Y = Qe("follow-sources", st), X = ze(J ? ht.length : R.length, b, Oe), Z = Ze({
		features: rt,
		data: ht,
		columns: Ct,
		getRowId: (e) => String(e.source.id),
		state: {
			sorting: q,
			rowSelection: wt,
			pagination: {
				pageIndex: X.page - 1,
				pageSize: b
			},
			columnVisibility: Y.visibility
		},
		onColumnVisibilityChange: Y.change,
		manualSorting: !0,
		enableRowSelection: !0,
		onSortingChange: (e) => {
			let t = (typeof e == "function" ? e(q) : e)[0];
			if (!t) return;
			let n = s[t.id];
			n && C(n, t.desc ? "desc" : "asc");
		},
		onRowSelectionChange: (e) => {
			let t = typeof e == "function" ? e(wt) : e;
			j(new Set(Object.entries(t).filter(([, e]) => e).map(([e]) => Number(e))));
		},
		onPaginationChange: (e) => {
			let t = {
				pageIndex: X.page - 1,
				pageSize: b
			}, n = typeof e == "function" ? e(t) : e;
			n.pageSize === b ? n.pageIndex !== t.pageIndex && Ue(n.pageIndex + 1) : Je(n.pageSize);
		}
	}), Tt = Z.getRowModel().rows, Et = J ? Tt.map((e) => e.original.source.id) : R.slice(X.start, X.end).flatMap((e) => e.map((e) => e.id)), Dt = We(x, Et), Q = [...x], Ot = we(V), kt = N.filter((e) => e.enabled && (e.last_status === "error" || e.last_status === "unauthorized")).map((e) => e.id), At = Ce(V), $ = R.length > 0 && I.size >= R.length;
	return N.length ? /* @__PURE__ */ (0, k.jsxs)("div", {
		className: Se({
			padding: "none",
			className: "flex flex-col gap-4 px-6 py-5 max-sm:px-4"
		}),
		children: [
			/* @__PURE__ */ (0, k.jsxs)("div", {
				ref: ft,
				"data-follow-toolbar": "",
				"data-responsive-toolbar": "",
				children: [/* @__PURE__ */ (0, k.jsxs)("span", {
					"data-follow-toolbar-heading": "",
					"data-toolbar-heading": "",
					children: [/* @__PURE__ */ (0, k.jsx)("h3", {
						className: "text-title-2-medium text-text-primary",
						children: "关注列表"
					}), /* @__PURE__ */ (0, k.jsx)("span", {
						className: "text-body-2-regular text-text-secondary",
						children: `${N.length.toLocaleString()} 个来源${F.new ? ` · ${A(F.new)} 条未看` : ""}`
					})]
				}), /* @__PURE__ */ (0, k.jsxs)("div", {
					"data-follow-toolbar-actions": "",
					"data-toolbar-actions": "",
					children: [
						kt.length ? /* @__PURE__ */ (0, k.jsx)(o, {
							variant: "secondary",
							disabled: S,
							...h(K.busy),
							onClick: () => H(kt),
							children: "检查失败项"
						}) : null,
						/* @__PURE__ */ (0, k.jsx)(o, {
							variant: "primary",
							leadingIcon: v,
							disabled: S,
							"aria-label": "检查全部",
							iconOnly: pt,
							...h(K.busy),
							onClick: () => H([]),
							children: "检查全部"
						}),
						/* @__PURE__ */ (0, k.jsxs)("span", {
							"data-follow-toolbar-controls": "",
							className: "contents",
							children: [
								/* @__PURE__ */ (0, k.jsxs)("span", {
									"data-button-group": !0,
									role: "group",
									"aria-label": "关注列表版式",
									children: [/* @__PURE__ */ (0, k.jsx)(o, {
										variant: "ghost",
										iconOnly: !0,
										leadingIcon: ye,
										"aria-label": ae[0][1],
										"aria-pressed": !J,
										onClick: () => w("default")
									}), /* @__PURE__ */ (0, k.jsx)(o, {
										variant: "ghost",
										iconOnly: !0,
										leadingIcon: je,
										"aria-label": ae[1][1],
										"aria-pressed": J,
										onClick: () => w("table")
									})]
								}),
								J ? /* @__PURE__ */ (0, k.jsx)(he, {
									preferences: Y,
									label: "关注来源"
								}) : null,
								/* @__PURE__ */ (0, k.jsxs)("span", {
									className: "flex flex-none items-center gap-2",
									children: [/* @__PURE__ */ (0, k.jsx)(le, {
										"aria-label": "关注列表排序",
										prefix: "排序",
										selectedKey: m,
										onSelectionChange: (e) => {
											if (e === null) return;
											let t = String(e);
											C(t, se[t]);
										},
										children: ce.map(([e, t]) => /* @__PURE__ */ (0, k.jsx)(ue, {
											id: e,
											children: t
										}, e))
									}), /* @__PURE__ */ (0, k.jsx)(o, {
										variant: "secondary",
										iconOnly: !0,
										leadingIcon: fe,
										"data-icon-state": g === "asc" ? "a" : "b",
										"aria-label": Ke(m, g),
										onClick: () => C(m, g === "asc" ? "desc" : "asc")
									})]
								}),
								J ? null : /* @__PURE__ */ (0, k.jsx)(o, {
									variant: "secondary",
									iconOnly: pt,
									leadingIcon: re,
									"aria-expanded": !$,
									"aria-label": $ ? "全部展开" : "全部收起",
									onClick: () => dt($ ? /* @__PURE__ */ new Set() : new Set(R.map((e) => String(e[0].author_key || e[0].id)))),
									children: $ ? "全部展开" : "全部收起"
								})
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, k.jsxs)("div", {
				"aria-live": "polite",
				className: "flex flex-col gap-3 empty:hidden",
				children: [
					B ? /* @__PURE__ */ (0, k.jsx)(ve, {
						embedded: !0,
						label: z?.message || (z?.total ? `${z.older ? "抓取历史" : "检查更新"}：已完成 ${z.checked || 0}/${z.total} 个来源` : "正在准备检查任务"),
						value: z?.checked,
						total: z?.total
					}) : null,
					mt ? /* @__PURE__ */ (0, k.jsx)(p, {
						tone: "error",
						title: "操作未完成",
						children: mt
					}) : null,
					!B && V?.results?.length ? /* @__PURE__ */ (0, k.jsx)(p, {
						tone: "neutral",
						title: "检查结果",
						children: Ee(V)
					}) : null,
					Ot.length ? /* @__PURE__ */ (0, k.jsx)(p, {
						tone: "error",
						title: `${Ot.length} 个来源检查失败`,
						extra: /* @__PURE__ */ (0, k.jsx)("ul", {
							className: "flex flex-col gap-0.5 text-body-2-regular",
							children: Ot.map((e, t) => /* @__PURE__ */ (0, k.jsx)("li", { children: `${e.provider_label || e.provider || ""} ${e.author || e.label || e.ref || ""}：${Me(e.error || "") || "未说明原因"}` }, `${e.provider || ""}-${e.ref || t}`))
						}),
						children: "这些来源这一轮没有取到更新。"
					}) : null,
					At ? /* @__PURE__ */ (0, k.jsx)(p, {
						tone: "warning",
						children: `条目已保存，但这次未保存来源的原始响应：${At}`
					}) : null
				]
			}),
			/* @__PURE__ */ (0, k.jsxs)(de, {
				label: "关注来源批量操作",
				visible: Q.length > 0,
				count: `已选 ${Q.length} 个来源`,
				children: [
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						disabled: S,
						...h(K.busy),
						onClick: () => H(Q),
						children: "检查所选"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						disabled: S,
						...h(U.isPending),
						onClick: () => U.mutate({
							ids: Q,
							action: "enabled"
						}),
						children: "启用"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						disabled: S,
						...h(U.isPending),
						onClick: () => U.mutate({
							ids: Q,
							action: "paused"
						}),
						children: "暂停"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "danger",
						size: "small",
						disabled: S,
						...h(U.isPending),
						onClick: () => void _({
							title: `删除 ${Q.length} 个关注来源`,
							body: "将移除所选关注来源及其已抓取条目，媒体文件保留。",
							confirmLabel: "删除所选来源",
							danger: !0,
							onConfirm: () => U.mutateAsync({
								ids: Q,
								action: "remove"
							})
						}),
						children: "删除"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "ghost",
						size: "small",
						onClick: () => j(/* @__PURE__ */ new Set()),
						children: "取消选择"
					})
				]
			}),
			J ? /* @__PURE__ */ (0, k.jsx)(u, {
				follow: !0,
				preferences: Y,
				onRowClick: (e) => _t(Number(e), !x.has(Number(e))),
				children: /* @__PURE__ */ (0, k.jsxs)(me, {
					"aria-label": "关注来源",
					size: "sm",
					sortDescriptor: q[0] ? {
						column: q[0].id,
						direction: q[0].desc ? "descending" : "ascending"
					} : void 0,
					onSortChange: (e) => Z.setSorting([{
						id: String(e.column),
						desc: e.direction === "descending"
					}]),
					children: [/* @__PURE__ */ (0, k.jsxs)(ee, { children: [Z.getHeaderGroups()[0].headers.map((e) => {
						let t = e.column.id in s, r = Fe(e.column.columnDef.header, e.getContext());
						return /* @__PURE__ */ (0, k.jsx)(n, {
							id: e.id,
							allowsSorting: t,
							isRowHeader: e.column.id === "source",
							...Y.columnProps(e.id),
							children: ({ sortDirection: n }) => /* @__PURE__ */ (0, k.jsxs)(k.Fragment, { children: [e.id === "select" ? r : t ? /* @__PURE__ */ (0, k.jsxs)("span", {
								className: "flex items-center gap-0.5",
								children: [r, /* @__PURE__ */ (0, k.jsx)("span", {
									"data-sort-indicator": !0,
									"data-direction": n || void 0,
									children: /* @__PURE__ */ (0, k.jsx)(ne, {})
								})]
							}) : /* @__PURE__ */ (0, k.jsx)(a, { children: r }), /* @__PURE__ */ (0, k.jsx)(ge, {
								preferences: Y,
								id: e.id
							})] })
						}, e.id);
					}), /* @__PURE__ */ (0, k.jsx)(n, {
						id: "remaining-space",
						"aria-label": "行空白区域",
						"data-table-space": "",
						width: Y.spaceWidth,
						minWidth: 0
					})] }), /* @__PURE__ */ (0, k.jsx)(t, {
						renderEmptyState: () => "这一页没有来源",
						children: Tt.map((e) => /* @__PURE__ */ (0, k.jsxs)(r, {
							id: e.id,
							"data-follow-selected": e.getIsSelected() || void 0,
							children: [e.getVisibleCells().map((e) => /* @__PURE__ */ (0, k.jsx)(i, { children: Fe(e.column.columnDef.cell, e.getContext()) }, e.id)), /* @__PURE__ */ (0, k.jsx)(i, { "data-table-space": "" })]
						}, e.id))
					})]
				})
			}) : /* @__PURE__ */ (0, k.jsxs)(k.Fragment, { children: [/* @__PURE__ */ (0, k.jsx)(c, {
				isSelected: Dt.all,
				isIndeterminate: Dt.some,
				onChange: (e) => vt(Et, e),
				"aria-label": "全选本页来源",
				children: "全选本页"
			}), /* @__PURE__ */ (0, k.jsx)("div", {
				className: "flex flex-col gap-3",
				children: R.slice(X.start, X.end).map((e) => {
					let t = String(e[0].author_key || e[0].id);
					return /* @__PURE__ */ (0, k.jsx)(ct, {
						group: e,
						name: xe(e, P),
						handlers: K,
						selected: x,
						open: !I.has(t),
						onOpen: (e) => {
							let n = new Set(I);
							e ? n.delete(t) : n.add(t), dt(n);
						},
						onToggleGroup: (t) => vt(e.map((e) => e.id), t),
						onToggle: _t
					}, t);
				})
			})] }),
			/* @__PURE__ */ (0, k.jsx)(ie, {
				label: "关注列表",
				total: X.total,
				pagination: {
					pageIndex: X.page - 1,
					pageSize: b
				},
				unit: J ? "个来源" : "位创作者",
				pageUnit: J ? "条" : "位",
				onChange: (e) => {
					e.pageSize === b ? Z.setPageIndex(e.pageIndex) : Z.setPageSize(e.pageSize);
				}
			}),
			F.new ? /* @__PURE__ */ (0, k.jsxs)("div", {
				className: "-mx-6 -mb-5 flex flex-wrap items-center gap-2 border-t border-separator-border rounded-b-2xl bg-card-footer px-6 py-4 max-sm:-mx-4 max-sm:px-4",
				children: [
					/* @__PURE__ */ (0, k.jsx)("span", {
						className: "mr-auto text-body-2-regular text-text-secondary",
						children: `未看 ${A(F.new)} · 已看 ${A(F.seen)} · 已保存 ${A(F.saved)} · 已忽略 ${A(F.ignored)}`
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						onClick: lt,
						children: "去看更新"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						disabled: S,
						...h(W.isPending),
						onClick: () => void _({
							title: "标记已看",
							body: "将把当前未看作品标记为已看。",
							confirmLabel: "标记已看",
							onConfirm: () => W.mutateAsync("seen")
						}),
						children: "全部标记已看"
					}),
					/* @__PURE__ */ (0, k.jsx)(o, {
						variant: "secondary",
						size: "small",
						disabled: S,
						...h(W.isPending),
						onClick: () => void _({
							title: "标记已忽略",
							body: "将把当前未看作品标记为已忽略。",
							confirmLabel: "标记已忽略",
							onConfirm: () => W.mutateAsync("ignored")
						}),
						children: "全部忽略"
					})
				]
			}) : null
		]
	}) : /* @__PURE__ */ (0, k.jsx)(d, {
		icon: te,
		title: "还没有关注来源",
		actions: /* @__PURE__ */ (0, k.jsx)(o, {
			variant: "primary",
			size: "small",
			onClick: ut,
			children: "添加关注"
		}),
		children: "关注来源及其检查状态会显示在这里。"
	});
}
export { lt as SourceList };

//# debugId=cf9fe502-e46c-4f37-a8b5-bb57a7442240