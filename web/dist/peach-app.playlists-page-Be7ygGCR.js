(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "465aa33d-8645-429a-9e27-34a76a0d2d12", e._sentryDebugIdIdentifier = "sentry-dbid-465aa33d-8645-429a-9e27-34a76a0d2d12");
	} catch {}
})();
import { $2ec61d1d4f780267$export$a8a3e93435678ff9 as e, $542a13ca2fa5b484$export$5b6b19405a83ff9d as t, Button as n, EmptyFocusButton as r, EmptyState as i, Input as a, MENU_ITEM as o, MENU_ITEM_INTERACTIVE as s, MENU_POPOVER_SURFACE as c, MenuDialog as l, MixCard as u, ModalFrame as d, PLAYLISTS_KEY as f, RetryNote as p, __toESM as m, busyProps as h, confirmModal as g, createPlaylist as _, cx as v, deletePlaylist as y, errorMessage as b, fetchPlaylists as x, keepPlaylist as S, posterUrl as C, recreatePlaylist as w, refreshPlaylists as T, renamePlaylist as E, require_jsx_runtime as D, require_react as O, resumeAssetId as k, spriteGlyph as A, useMutation as j, useQuery as M } from "./peach-app.js";
// src/react/playlists/playlists-page.tsx
var N = /* @__PURE__ */ m(O(), 1), P = D(), F = A("ellipsis"), I = A("pencil"), L = A("trash"), R = A("playlist"), z = v(o, s, "text-body-2-medium"), B = "播放列表名称不能为空", V = (e) => async () => {
	try {
		await e();
	} finally {
		T();
	}
};
function H({ toast: e }) {
	let [t, r] = (0, N.useState)(""), [i, o] = (0, N.useState)(""), s = j({
		mutationFn: (e) => _(e),
		onSuccess: (t) => {
			r(""), o(""), T(), e("已新建播放列表", { undo: V(() => y(t.playlist.id)) });
		},
		onError: (e) => o(b(e) || "新建失败")
	});
	return /* @__PURE__ */ (0, P.jsxs)("form", {
		"data-playlist-create": "",
		"aria-label": "新建播放列表",
		onSubmit: (e) => {
			e.preventDefault(), !s.isPending && (t.trim() ? s.mutate(t) : o(B));
		},
		className: "flex flex-wrap items-end gap-2",
		children: [/* @__PURE__ */ (0, P.jsx)("div", {
			className: "min-w-50 max-w-80 flex-1 basis-50 max-board-narrow:min-w-0 max-board-narrow:max-w-none",
			children: /* @__PURE__ */ (0, P.jsx)(a, {
				label: "新播放列表",
				placeholder: "输入名称",
				maxLength: 80,
				value: t,
				onChange: (e) => {
					r(e), o("");
				},
				validationBehavior: "aria",
				isInvalid: !!i,
				hint: i || void 0
			})
		}), /* @__PURE__ */ (0, P.jsx)(n, {
			type: "submit",
			...h(s.isPending),
			children: "新建"
		})]
	});
}
function U({ target: t, close: r, toast: i }) {
	let [o, s] = (0, N.useState)(""), [c, l] = (0, N.useState)(""), u = (0, N.useRef)(null);
	(0, N.useEffect)(() => {
		if (!t) return;
		s(t.name), l("");
		let e = requestAnimationFrame(() => {
			u.current?.focus(), u.current?.select();
		});
		return () => cancelAnimationFrame(e);
	}, [t]);
	let f = j({
		mutationFn: ({ row: e, value: t }) => E(e.id, t),
		onSuccess: (e, { row: t }) => {
			r(), T(), i("已重命名播放列表", { undo: V(() => E(t.id, t.name)) });
		},
		onError: (e) => l(b(e))
	});
	return /* @__PURE__ */ (0, P.jsx)(d, {
		isOpen: !!t,
		onOpenChange: (e) => {
			e || r();
		},
		width: "form",
		children: /* @__PURE__ */ (0, P.jsxs)("form", {
			"data-playlist-rename": "",
			onSubmit: (e) => {
				if (e.preventDefault(), !t || f.isPending) return;
				let n = o.trim();
				n ? f.mutate({
					row: t,
					value: n
				}) : l(B);
			},
			className: "flex min-h-0 flex-col",
			children: [/* @__PURE__ */ (0, P.jsxs)("div", {
				className: "flex flex-col gap-4 p-5",
				children: [/* @__PURE__ */ (0, P.jsx)(e, {
					slot: "title",
					className: "text-title-2-semibold text-text-primary",
					children: "编辑名称"
				}), /* @__PURE__ */ (0, P.jsx)(a, {
					ref: u,
					label: "名称",
					placeholder: "输入名称",
					maxLength: 80,
					value: o,
					onChange: (e) => {
						s(e), l("");
					},
					validationBehavior: "aria",
					isInvalid: !!c,
					hint: c || void 0
				})]
			}), /* @__PURE__ */ (0, P.jsxs)("div", {
				className: "flex justify-between gap-4 p-3",
				children: [/* @__PURE__ */ (0, P.jsx)(n, {
					variant: "secondary",
					onClick: r,
					children: "取消"
				}), /* @__PURE__ */ (0, P.jsx)(n, {
					type: "submit",
					...h(f.isPending),
					children: "保存名称"
				})]
			})]
		})
	});
}
function W({ name: e, onRename: n, onDelete: r }) {
	let i = (0, N.useRef)(null), [a, o] = (0, N.useState)(!1), s = (e) => {
		o(!1), e();
	};
	return /* @__PURE__ */ (0, P.jsxs)(P.Fragment, { children: [/* @__PURE__ */ (0, P.jsx)("button", {
		ref: i,
		type: "button",
		title: "更多操作",
		"aria-label": `播放列表操作：${e}`,
		"aria-haspopup": "dialog",
		"aria-expanded": a,
		"data-playlist-menu": "",
		onClick: () => o(!0),
		className: "flex size-7.5 flex-none cursor-pointer items-center justify-center rounded-2lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary aria-expanded:bg-background-primary-hover aria-expanded:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
		children: /* @__PURE__ */ (0, P.jsx)(F, {
			"aria-hidden": !0,
			className: "size-4.5"
		})
	}), /* @__PURE__ */ (0, P.jsx)(t, {
		triggerRef: i,
		isOpen: a,
		onOpenChange: o,
		placement: "bottom end",
		offset: 4,
		className: c,
		children: /* @__PURE__ */ (0, P.jsxs)(l, {
			"aria-label": `播放列表操作：${e}`,
			className: "flex w-37.5 flex-col gap-0.5 outline-none",
			children: [/* @__PURE__ */ (0, P.jsxs)("button", {
				type: "button",
				className: z,
				onClick: () => s(n),
				children: [/* @__PURE__ */ (0, P.jsx)(I, {
					"aria-hidden": !0,
					className: "size-(--icon-inline) shrink-0"
				}), "编辑名称"]
			}), /* @__PURE__ */ (0, P.jsxs)("button", {
				type: "button",
				className: z,
				onClick: () => s(r),
				children: [/* @__PURE__ */ (0, P.jsx)(L, {
					"aria-hidden": !0,
					className: "size-(--icon-inline) shrink-0"
				}), "删除播放列表"]
			})]
		})
	})] });
}
function G({ openPlaylist: e, openEntity: t, canFlip: n, toast: a, revision: o }) {
	let s = M({
		queryKey: f,
		queryFn: ({ signal: e }) => x(e)
	}), [c, l] = (0, N.useState)(null), d = (0, N.useRef)(o);
	(0, N.useEffect)(() => {
		d.current !== o && (d.current = o, T());
	}, [o]);
	let m = s.data, h = m?.items ?? [], _ = (e) => {
		g({
			title: "删除播放列表",
			body: "这个播放列表将被删除，视频文件保留。",
			confirmLabel: "删除播放列表",
			danger: !0,
			onConfirm: async () => {
				let t = await S(e.id);
				await y(e.id), T(), a("已删除播放列表", t ? { undo: V(() => w(t)) } : void 0);
			}
		});
	};
	return /* @__PURE__ */ (0, P.jsxs)("div", {
		className: "w-full pt-1 pb-10.5",
		children: [
			/* @__PURE__ */ (0, P.jsxs)("header", {
				className: "mb-4 flex items-start justify-between gap-4.5 max-board-narrow:flex-col max-board-narrow:items-stretch",
				children: [/* @__PURE__ */ (0, P.jsxs)("div", { children: [/* @__PURE__ */ (0, P.jsx)("h2", {
					className: "mb-1 text-display-4-medium! text-text-primary",
					children: "播放列表"
				}), /* @__PURE__ */ (0, P.jsx)("p", {
					className: "text-body-2-regular text-text-secondary",
					children: "保存 Mix，按自己的顺序继续播放。"
				})] }), /* @__PURE__ */ (0, P.jsx)(H, { toast: a })]
			}),
			/* @__PURE__ */ (0, P.jsx)("div", {
				className: "mx-auto w-full max-w-board",
				children: m ? h.length ? /* @__PURE__ */ (0, P.jsx)("div", {
					"data-playlist-grid": "",
					className: "card-grid-cover gap-4.5",
					children: h.map((r) => {
						let i = k(r), a = r.name.trim() || "未命名播放列表";
						return /* @__PURE__ */ (0, P.jsx)(u, {
							"data-playlist-card": String(r.id),
							name: a,
							caption: r.source_kind === "mix" ? "由 Mix 保存" : "手动播放列表",
							count: r.item_count,
							poster: r.preview_asset_id ? C(r.preview_asset_id) : null,
							flipImages: async () => (r.preview_ids || []).map(C),
							canFlip: n,
							faces: r.faces || [],
							onOpenEntity: t,
							...i ? { onOpen: () => e(r.id, i) } : {},
							openLabel: `打开播放列表 ${a}`,
							menu: /* @__PURE__ */ (0, P.jsx)(W, {
								name: a,
								onRename: () => l(r),
								onDelete: () => _(r)
							})
						}, r.id);
					})
				}) : /* @__PURE__ */ (0, P.jsx)(i, {
					icon: R,
					title: "还没有播放列表",
					actions: /* @__PURE__ */ (0, P.jsx)(r, {
						target: "[data-playlist-create] input",
						children: "新建播放列表"
					}),
					children: "保存 Mix 或新建列表后，会在这里按自己的顺序继续播放。"
				}) : s.isError ? /* @__PURE__ */ (0, P.jsx)(p, {
					message: b(s.error) || "播放列表读取失败",
					onRetry: () => void s.refetch()
				}) : null
			}),
			/* @__PURE__ */ (0, P.jsx)(U, {
				target: c,
				close: () => l(null),
				toast: a
			})
		]
	});
}
export { G as PlaylistsPage };

//# debugId=465aa33d-8645-429a-9e27-34a76a0d2d12