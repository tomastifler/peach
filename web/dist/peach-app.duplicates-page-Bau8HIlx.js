(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "403de930-50fc-40ec-8f97-73d7799bb414", e._sentryDebugIdIdentifier = "sentry-dbid-403de930-50fc-40ec-8f97-73d7799bb414");
	} catch {}
})();
import { Button as e, CollectionSummary as t, DUPLICATES_KEY as n, EmptyState as r, FilterGlass as i, GlassPill as a, KEEP_LABELS as o, LOC as s, MEDIA_SOURCES_KEY as c, MEDIA_SOURCE_ICONS as l, Note as u, SourceLabel as d, SourceMark as f, TRASH_KEY as p, __toESM as m, batchOperate as h, bulkCloudPreferences as g, busyProps as _, cardClass as v, cloudLocations as y, confirmModal as b, distinctName as x, duplicateVictims as S, errorMessage as C, fetchDuplicates as w, fetchMediaSources as T, fmtDur as E, fmtSize as D, mixedCloudPreferences as O, queryClient as k, require_jsx_runtime as A, require_react as j, sharedNamePrefix as M, spriteGlyph as N, useMutation as P, useQuery as F, victimBytes as I } from "./peach-app.js";
// src/react/duplicates/duplicates-page.tsx
var L = /* @__PURE__ */ m(j(), 1), R = A(), z = N("play"), B = N("file-stack"), V = v({
	padding: "none",
	radius: "surface",
	className: "mb-6 overflow-hidden dark:bg-background-primary-default"
}), H = "rounded-sm px-1.5 py-px text-caption-1-regular leading-5", U = "rounded-sm px-2 py-0.5 text-caption-1-regular leading-5", W = "font-mono text-caption-1-regular leading-5 text-text-secondary", G = () => {
	k.invalidateQueries({
		queryKey: n,
		exact: !0
	}), k.invalidateQueries({
		queryKey: p,
		exact: !0
	});
};
function K(e) {
	return e.identical ? /* @__PURE__ */ (0, R.jsx)("span", {
		className: `${U} text-(--keep)`,
		children: "sha1 一致"
	}) : /* @__PURE__ */ (0, R.jsx)("span", {
		className: `${U} text-text-secondary`,
		children: e.evidence === "same_code_short_copy" ? "同番号短版本" : "时长推断"
	});
}
function q({ file: e, prefix: t, openItem: n }) {
	let r = () => n(e.id), i = s[e.location] || e.location || e.drive;
	return /* @__PURE__ */ (0, R.jsxs)("div", {
		className: "duplicate-row items-center gap-3 border-t border-separator-border px-5 py-4 max-compact:p-4",
		children: [
			/* @__PURE__ */ (0, R.jsxs)("button", {
				type: "button",
				onClick: r,
				"aria-label": `预览 ${e.name}`,
				className: "relative row-span-2 inline-grid aspect-16/10 w-full cursor-pointer place-items-center overflow-hidden rounded-2lg bg-background-tertiary-default text-text-secondary",
				children: [/* @__PURE__ */ (0, R.jsx)(z, {
					"aria-hidden": !0,
					className: "size-6"
				}), /* @__PURE__ */ (0, R.jsx)("img", {
					src: `/thumb?id=${e.id}&c=4`,
					alt: "",
					loading: "lazy",
					onError: (e) => e.currentTarget.remove(),
					className: "absolute inset-0 size-full object-contain"
				})]
			}),
			/* @__PURE__ */ (0, R.jsxs)("span", {
				className: "flex min-w-0 items-center gap-2 max-duplicate-narrow:col-start-2 max-duplicate-narrow:-col-end-1",
				children: [/* @__PURE__ */ (0, R.jsx)("button", {
					type: "button",
					onClick: r,
					title: e.name,
					"data-middle-truncate": !0,
					"data-middle-truncate-within": !0,
					className: "min-w-0 shrink cursor-pointer truncate text-left text-body-regular hover:text-text-secondary",
					children: x(e.name, t)
				}), e.is_largest || e.is_longest ? /* @__PURE__ */ (0, R.jsxs)("span", {
					className: "flex flex-none gap-1",
					children: [e.is_largest ? /* @__PURE__ */ (0, R.jsx)("i", {
						className: `${H} not-italic bg-background-primary-hover text-text-secondary`,
						children: "最大"
					}) : null, e.is_longest ? /* @__PURE__ */ (0, R.jsx)("i", {
						className: `${H} not-italic bg-(--keep)/22 text-(--keep)`,
						children: "最长"
					}) : null]
				}) : null]
			}),
			/* @__PURE__ */ (0, R.jsxs)("span", {
				className: `${W} flex min-w-0 items-center gap-1.5`,
				children: [/* @__PURE__ */ (0, R.jsx)(f, { mark: l[e.location] || "database" }), /* @__PURE__ */ (0, R.jsx)("span", {
					title: i,
					className: "min-w-0 truncate",
					children: i
				})]
			}),
			/* @__PURE__ */ (0, R.jsx)("span", {
				className: W,
				children: D(e.size || 0)
			}),
			/* @__PURE__ */ (0, R.jsx)("span", {
				className: W,
				children: E(e.duration)
			}),
			/* @__PURE__ */ (0, R.jsx)("span", {
				className: `${W} col-start-2 -col-end-1 min-w-0 pt-0.5 wrap-anywhere max-duplicate-narrow:col-span-full`,
				children: e.path ?? ""
			})
		]
	});
}
function J({ openItem: l, toast: f, failure: p }) {
	let m = F({
		queryKey: n,
		queryFn: ({ signal: e }) => w(e)
	}), v = F({
		queryKey: c,
		queryFn: ({ signal: e }) => T(e)
	}), [x, E] = (0, L.useState)(""), k = P({
		mutationFn: (e) => h(e, "dispose"),
		onSuccess: (e, t) => {
			G(), f(`已把 ${t.length} 项移入回收站`, { undo: async () => {
				try {
					await h(t, "restore");
				} catch (e) {
					p("撤销移入回收站", e);
				} finally {
					G();
				}
			} });
		},
		onSettled: () => E("")
	}), A = m.data;
	if (!A) return /* @__PURE__ */ (0, R.jsx)("div", {
		className: "mx-auto w-full max-w-board",
		children: /* @__PURE__ */ (0, R.jsx)(u, {
			tone: "error",
			title: "重复文件读取失败",
			children: m.error ? C(m.error) : "未取得重复文件列表，请刷新页面重试。"
		})
	});
	let j = A.groups ?? [], N = y(v.data), z = ({ groups: e, keep: t, key: n }) => {
		if (k.isPending) return;
		let r = S(e, t);
		r.length && b({
			title: "移入回收站",
			body: `将把 ${r.length} 个重复文件的馆藏记录移入回收站，每组保留${o[t] ?? o.largest}。文件共 ${D(I(e, r))}，记录可从回收站还原。`,
			confirmLabel: "移入回收站",
			onConfirm: () => (E(n), k.mutateAsync(r))
		});
	}, H = (e) => _(x === e && k.isPending);
	return /* @__PURE__ */ (0, R.jsxs)("div", {
		className: "mx-auto w-full max-w-board pb-10.5",
		children: [
			/* @__PURE__ */ (0, R.jsx)(t, {
				label: "重复内容",
				figure: `${Number(A.total || 0).toLocaleString()} 组`,
				detail: `${Number(A.files || 0).toLocaleString()} 个文件 · 可回收 ${D(A.reclaimable)}`
			}),
			j.length ? /* @__PURE__ */ (0, R.jsxs)(i, {
				title: "批量保留",
				children: [
					/* @__PURE__ */ (0, R.jsx)(a, {
						busy: x === "all:largest",
						onPress: () => z({
							groups: j,
							keep: "largest",
							key: "all:largest"
						}),
						children: "全部保留最大"
					}),
					/* @__PURE__ */ (0, R.jsx)(a, {
						busy: x === "all:longest",
						onPress: () => z({
							groups: j,
							keep: "longest",
							key: "all:longest"
						}),
						children: "全部保留最长"
					}),
					g(j, N).map((e) => /* @__PURE__ */ (0, R.jsx)(a, {
						busy: x === `all:${e}`,
						onPress: () => z({
							groups: j,
							keep: e,
							key: `all:${e}`
						}),
						children: /* @__PURE__ */ (0, R.jsx)(d, {
							source: e,
							label: `全部优先 ${s[e] || e}`
						})
					}, e))
				]
			}) : null,
			k.isError ? /* @__PURE__ */ (0, R.jsx)("div", {
				className: "mb-5",
				children: /* @__PURE__ */ (0, R.jsx)(u, {
					tone: "error",
					title: "移入回收站失败",
					children: C(k.error)
				})
			}) : null,
			j.length ? j.map((t, n) => {
				let r = [t], i = M(t.files.map((e) => e.name)), a = (e) => `${n}:${e}`;
				return /* @__PURE__ */ (0, R.jsxs)("section", {
					"aria-label": t.code,
					className: V,
					children: [/* @__PURE__ */ (0, R.jsxs)("div", {
						className: "flex flex-wrap items-center gap-3 bg-background-tertiary-default p-5 max-compact:p-4 dark:bg-background-secondary-default",
						children: [
							/* @__PURE__ */ (0, R.jsx)("b", {
								className: "text-title-2-medium text-text-primary",
								children: t.code
							}),
							/* @__PURE__ */ (0, R.jsx)("span", {
								className: "font-mono text-caption-1-regular leading-5 text-text-primary",
								children: `${Number(t.count || 0).toLocaleString()} 个 · 可回收 ${D(t.reclaimable)}`
							}),
							K(t),
							t.cross_drive ? /* @__PURE__ */ (0, R.jsx)("span", {
								className: `${U} text-text-secondary`,
								children: `跨盘 ${t.drives.join(" ")}`
							}) : null,
							/* @__PURE__ */ (0, R.jsxs)("span", {
								className: "ml-auto flex flex-wrap gap-2 max-compact:ml-0 max-compact:w-full",
								children: [
									/* @__PURE__ */ (0, R.jsx)(e, {
										variant: "secondary",
										size: "small",
										...H(a("largest")),
										onClick: () => z({
											groups: r,
											keep: "largest",
											key: a("largest")
										}),
										children: "留最大"
									}),
									/* @__PURE__ */ (0, R.jsx)(e, {
										variant: "secondary",
										size: "small",
										...H(a("longest")),
										onClick: () => z({
											groups: r,
											keep: "longest",
											key: a("longest")
										}),
										children: "留最长"
									}),
									O(t.files, N).map((t) => /* @__PURE__ */ (0, R.jsx)(e, {
										variant: "secondary",
										size: "small",
										...H(a(t)),
										onClick: () => z({
											groups: r,
											keep: t,
											key: a(t)
										}),
										children: /* @__PURE__ */ (0, R.jsx)(d, {
											source: t,
											label: `留 ${s[t] || t}`
										})
									}, t)),
									/* @__PURE__ */ (0, R.jsx)(e, {
										variant: "danger",
										size: "small",
										...H(a("all")),
										onClick: () => z({
											groups: r,
											keep: "all",
											key: a("all")
										}),
										children: "整组回收"
									})
								]
							})
						]
					}), /* @__PURE__ */ (0, R.jsx)("div", { children: t.files.map((e) => /* @__PURE__ */ (0, R.jsx)(q, {
						file: e,
						prefix: i,
						openItem: l
					}, e.id)) })]
				}, `${t.code}-${n}`);
			}) : /* @__PURE__ */ (0, R.jsx)(r, {
				icon: B,
				title: "没有找到重复文件",
				children: "所有来源之间没有检测到内容相同的文件。扫描新来源后，这里会自动更新。"
			}),
			j.length > 0 && A.total > j.length ? /* @__PURE__ */ (0, R.jsx)("p", {
				className: "text-center text-caption-1-regular text-text-secondary",
				children: `显示可回收最多的前 ${j.length.toLocaleString()} 组，共 ${Number(A.total).toLocaleString()} 组；处理掉这些后，其余的会补上来。`
			}) : null
		]
	});
}
export { J as DuplicatesPage };

//# debugId=403de930-50fc-40ec-8f97-73d7799bb414