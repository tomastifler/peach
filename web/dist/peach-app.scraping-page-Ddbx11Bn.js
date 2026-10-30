(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "29f9e346-1df7-4000-acce-466d6653fd1d", e._sentryDebugIdIdentifier = "sentry-dbid-29f9e346-1df7-4000-acce-466d6653fd1d");
	} catch {}
})();
import { $fe21c36db05242bb$export$d7b12c4107be0d61 as e, AMANE_BRIDGE_CHECK_URL as t, AMANE_BRIDGE_KEY as n, AMANE_BRIDGE_REBUILD_URL as r, Button as i, COVER_JOB_KEY as a, CUSTOM_SOURCES_KEY as o, CUSTOM_SOURCES_URL as s, Checkbox as c, Disclosure as l, ErrorText as u, ExternalLink as d, Fact as f, FactList as p, FieldLabel as m, Footer as h, Help as g, Input as _, LinkButton as v, LoadingDots as y, Note as b, Rows as ee, SCRAPING_CHECK_URL as te, SCRAPING_COVER_URL as x, SCRAPING_KEY as S, SCRAPING_SETTINGS_URL as ne, SEGMENT as re, SEGMENTED_TRACK as ie, Section as C, SegmentedRadioGroup as ae, Select$1 as oe, SelectField as w, SelectItem as se, SettingsRow as ce, Stack as T, StatusLabel as E, __toESM as D, apiSend as O, busyProps as k, checkText as le, confirmModal as A, errorMessage as j, esc as M, fetchAmaneBridge as N, fetchCoverJob as P, fetchCustomSources as F, fetchSources as I, i2 as ue, queryClient as L, require_jsx_runtime as R, require_react as z, spinnerHtml as B, useAction as V, useBackgroundJob as H, useMutation as U, useQuery as W } from "./peach-app.js";
import { CodeBlock as de } from "./peach-app.code-block-CyDva4Ms.js";
import { Page as G } from "./peach-app.page-QAncjzM1.js";
import { SiteMark as K } from "./peach-app.site-mark-D_VlIyJz.js";
import { ConnectionStatus as fe } from "./peach-app.connection-status-DI6kgn3i.js";
// src/react/scraping/custom-sources.tsx
var q = /* @__PURE__ */ D(z(), 1), J = R(), pe = [
	["code", "番号"],
	["title", "标题"],
	["studio", "厂牌"],
	["series", "系列"],
	["release_date", "发行日期"],
	["performers", "演员（文本数组）"],
	["tags", "标签（文本数组）"]
], me = [
	["censored", "有码"],
	["amateur", "素人"],
	["uncensored", "无码"],
	["fc2", "FC2"],
	["kmib", "韩国 MIB"],
	["other", "其他"],
	["unsure", "待核番号"],
	["unknown", "未知"]
], he = () => ({
	name: "",
	endpoint: "",
	enabled: !1,
	fields: {
		code: "id",
		title: "title"
	},
	content_types: ["censored"]
});
function Y({ receipt: e }) {
	let [t, n] = (0, q.useState)(null), r = W({
		queryKey: o,
		queryFn: ({ signal: e }) => F(e)
	}), a = V(), c = (e) => L.setQueryData(o, e), l = !!(r.isPending || r.error || r.data?.items.length || a.error), d = /* @__PURE__ */ (0, J.jsx)(i, {
		variant: "secondary",
		onClick: () => n(he()),
		children: "添加来源"
	});
	return /* @__PURE__ */ (0, J.jsxs)(C, {
		title: "自定义元数据来源",
		children: [
			l ? /* @__PURE__ */ (0, J.jsxs)(T, { children: [
				r.isPending ? /* @__PURE__ */ (0, J.jsx)("div", {
					"aria-busy": "true",
					"data-skeleton": "",
					"aria-label": "读取自定义来源"
				}) : null,
				r.error ? /* @__PURE__ */ (0, J.jsx)(u, { children: j(r.error) }) : null,
				r.data?.items.map((t) => /* @__PURE__ */ (0, J.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [
						/* @__PURE__ */ (0, J.jsx)("span", {
							className: "min-w-0 flex-1",
							children: t.name
						}),
						/* @__PURE__ */ (0, J.jsx)(E, {
							tone: t.enabled ? "success" : "neutral",
							children: t.enabled ? "已启用" : "已停用"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "secondary",
							onClick: () => n(t),
							children: "编辑"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "secondary",
							...k(a.busy === t.id),
							onClick: () => void a.run(t.id, (e) => O(s, {
								...t,
								enabled: !t.enabled
							}, "POST", e), (n) => {
								c(n), e(t.enabled ? "已停用来源" : "已启用来源");
							}),
							children: t.enabled ? "停用" : "启用"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "danger",
							onClick: () => A({
								title: "删除自定义来源",
								body: `删除「${M(t.name)}」后，采集将不再查询这个来源。`,
								confirmLabel: "删除来源",
								danger: !0,
								onConfirm: async () => {
									c(await O(s, {
										action: "delete",
										id: t.id
									})), n(null), e("已删除来源");
								}
							}),
							children: "删除"
						})
					]
				}, t.id)),
				a.error ? /* @__PURE__ */ (0, J.jsx)(u, { children: a.error }) : null
			] }) : null,
			t ? null : l ? /* @__PURE__ */ (0, J.jsx)(h, { children: d }) : /* @__PURE__ */ (0, J.jsx)(T, { children: /* @__PURE__ */ (0, J.jsx)("div", {
				className: "flex justify-end",
				children: d
			}) }),
			t ? /* @__PURE__ */ (0, J.jsx)(ge, {
				initial: t,
				cancel: () => n(null),
				saved: (t) => {
					c(t), n(null), e("已保存来源");
				}
			}, t.id || "new") : null
		]
	});
}
function ge({ initial: e, cancel: t, saved: n }) {
	let [r, a] = (0, q.useState)(e), [o, l] = (0, q.useState)(""), [d, f] = (0, q.useState)(""), p = (0, q.useRef)(0), v = V(), y = (e) => {
		p.current++, a((t) => ({
			...t,
			...e
		})), f("");
	};
	return /* @__PURE__ */ (0, J.jsxs)("form", {
		"aria-label": "元数据来源配置",
		"aria-busy": v.busy === "preview",
		onSubmit: (e) => {
			e.preventDefault(), v.run("save", (e) => O(s, r, "POST", e), n);
		},
		children: [/* @__PURE__ */ (0, J.jsxs)(T, { children: [
			/* @__PURE__ */ (0, J.jsx)(_, {
				label: "来源名称",
				value: r.name,
				maxLength: 80,
				onChange: (e) => y({ name: e })
			}),
			/* @__PURE__ */ (0, J.jsx)(_, {
				label: "JSON 接口地址",
				value: r.endpoint,
				maxLength: 2048,
				placeholder: "https://example.com/api/movies/{code}",
				onChange: (e) => y({ endpoint: e })
			}),
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)(m, { children: "来源连接方式" }), /* @__PURE__ */ (0, J.jsx)(w, {
					id: "custom-source-network",
					label: "来源连接方式",
					epoch: 0,
					value: r.network || "direct",
					options: [["direct", "直连"], ["peach_proxy", "Peach 代理"]],
					onPick: (e) => y({ network: e })
				})]
			}),
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)(m, { children: "接口番号格式" }), /* @__PURE__ */ (0, J.jsx)(w, {
					id: "custom-source-code-format",
					label: "接口番号格式",
					epoch: 0,
					value: r.code_format || "original",
					options: [
						["original", "原样"],
						["lowercase", "小写"],
						["compact", "去掉连字符"],
						["underscore", "连字符转下划线"]
					],
					onPick: (e) => y({ code_format: e })
				})]
			}),
			/* @__PURE__ */ (0, J.jsx)(g, { children: "填写公开 JSON 接口和响应字段路径，例如 data.title。番号字段用于核对作品身份。" }),
			pe.map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(_, {
				label: `${t}字段路径`,
				value: r.fields[e] || "",
				onChange: (t) => {
					let n = { ...r.fields };
					t ? n[e] = t : delete n[e], y({ fields: n });
				}
			}, e)),
			/* @__PURE__ */ (0, J.jsx)("div", {
				className: "flex flex-wrap gap-3",
				role: "group",
				"aria-label": "适用内容类型",
				children: me.map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(c, {
					isSelected: r.content_types.includes(e),
					onChange: (t) => y({ content_types: t ? [...r.content_types, e] : r.content_types.filter((t) => t !== e) }),
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, J.jsx)(c, {
				isSelected: r.enabled,
				onChange: (e) => y({ enabled: e }),
				children: "启用来源"
			}),
			/* @__PURE__ */ (0, J.jsx)(_, {
				label: "试查番号（回车查询）",
				value: o,
				onChange: (e) => {
					p.current++, l(e), f("");
				},
				onKeyDown: (e) => {
					if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
					e.preventDefault();
					let t = p.current;
					v.run("preview", (e) => O(s, {
						...r,
						code: o,
						action: "preview"
					}, "POST", e), (e) => {
						t === p.current && f(JSON.stringify(e.record, null, 2));
					}, (e) => {
						t === p.current && v.setError(j(e));
					});
				}
			}),
			v.busy === "preview" ? /* @__PURE__ */ (0, J.jsxs)(g, {
				role: "status",
				children: [/* @__PURE__ */ (0, J.jsx)("span", { dangerouslySetInnerHTML: { __html: B("正在试查来源") } }), "正在试查来源"]
			}) : null,
			d ? /* @__PURE__ */ (0, J.jsx)(de, {
				code: d,
				language: "json",
				label: "元数据接口返回"
			}) : null,
			v.error ? /* @__PURE__ */ (0, J.jsx)(u, { children: v.error }) : null
		] }), /* @__PURE__ */ (0, J.jsxs)(h, { children: [/* @__PURE__ */ (0, J.jsx)(i, {
			variant: "secondary",
			type: "button",
			onClick: t,
			children: "取消"
		}), /* @__PURE__ */ (0, J.jsx)(i, {
			type: "submit",
			...k(v.busy === "save"),
			children: "保存来源"
		})] })]
	});
}
// src/react/scraping/scraping-page.tsx
var X = [["peach", "Peach 代理"], ["direct", "直接连接"]];
function Z(e) {
	return X.some(([t]) => t === e) || !e ? [...X] : [...X, [e, e]];
}
function Q(e) {
	try {
		return new URL(e).host || e;
	} catch {
		return e;
	}
}
var $ = [["paste", "粘贴 Cookie"], ["file", "导入文件"]];
function _e() {
	return /* @__PURE__ */ (0, J.jsx)(K, { source: "github" });
}
function ve({ source: t, toast: n }) {
	let [r, a] = (0, q.useState)(t.network), [o, s] = (0, q.useState)(""), [c, l] = (0, q.useState)(""), [f, p] = (0, q.useState)($[0][0]), [g, y] = (0, q.useState)(""), [x, w] = (0, q.useState)(""), D = (0, q.useRef)(null);
	function A() {
		s(""), l(""), y(""), w(""), D.current && (D.current.value = "");
	}
	let M = U({
		mutationFn: (e) => O(ne, {
			source: t.source,
			network: r,
			cookie: o,
			cookies_text: c,
			revoke: e
		}),
		onSuccess: (e, t) => {
			L.setQueryData(S, (t) => t && {
				...t,
				sources: t.sources.map((t) => t.source === e.saved.source ? e.saved : t)
			}), A(), n(t ? "Cookie 已撤销" : "来源设置已保存");
		}
	}), N = U({ mutationFn: () => O(te, { source: t.source }) }), P = M.isPending || N.isPending, F = (e) => {
		e.preventDefault(), !P && (N.reset(), M.mutate(!1));
	}, I = () => {
		P || (N.reset(), M.mutate(!0));
	}, R = () => {
		P || (M.reset(), N.mutate());
	};
	async function z(e) {
		let t = e.currentTarget, n = t.files?.[0];
		if (l(""), w(""), !n) y("");
		else if (n.size > 262144) t.value = "", y(""), w("Cookie 文本超过 256 KiB");
		else try {
			let e = await n.text();
			l(e), y(n.name);
		} catch {
			w("Cookie 文件未读取，请重新选择");
		}
	}
	let B = x || (M.error ? j(M.error) : "") || (N.error ? j(N.error) : ""), V = N.data?.results ?? [], H = r === "peach" || t.accepts_cookie || t.browser || !!B || V.length > 0;
	return /* @__PURE__ */ (0, J.jsxs)(C, {
		title: t.label,
		onSubmit: F,
		aside: /* @__PURE__ */ (0, J.jsxs)("span", {
			className: "flex min-w-0 items-center gap-1",
			children: [/* @__PURE__ */ (0, J.jsx)(K, { source: t.source }), t.login ? /* @__PURE__ */ (0, J.jsx)(d, {
				href: t.login,
				children: Q(t.login)
			}) : null]
		}),
		children: [
			/* @__PURE__ */ (0, J.jsx)(ee, { children: /* @__PURE__ */ (0, J.jsx)(ce, {
				label: "连接方式",
				children: /* @__PURE__ */ (0, J.jsx)(oe, {
					"aria-label": "连接方式",
					className: "w-44 min-w-0",
					selectedKey: r,
					onSelectionChange: (e) => {
						e !== null && a(String(e));
					},
					children: Z(r).map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(se, {
						id: e,
						children: t
					}, e))
				})
			}) }),
			t.cooldown_until && t.cooldown_until > Date.now() / 1e3 ? /* @__PURE__ */ (0, J.jsx)(b, {
				tone: "warning",
				children: /* @__PURE__ */ (0, J.jsxs)("span", {
					className: "inline-flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, J.jsx)(E, {
						tone: "warning",
						children: "冷却中"
					}), /* @__PURE__ */ (0, J.jsxs)("span", { children: [
						"可在 ",
						(/* @__PURE__ */ new Date(t.cooldown_until * 1e3)).toLocaleString("zh-CN"),
						" 后重试。"
					] })]
				})
			}) : null,
			H ? /* @__PURE__ */ (0, J.jsxs)(T, {
				divided: !0,
				children: [
					r === "peach" ? /* @__PURE__ */ (0, J.jsx)("span", {
						className: "self-start",
						children: /* @__PURE__ */ (0, J.jsx)(v, {
							href: "/settings/library#peachProxy",
							size: "small",
							trailingIcon: ue,
							children: "配置 Peach 代理"
						})
					}) : null,
					t.browser ? /* @__PURE__ */ (0, J.jsx)("p", {
						className: "text-body-2-regular text-text-secondary",
						children: "人机验证由本机浏览器自动完成；需要点击时窗口会弹出。这台机器上不需要 Cookie。"
					}) : null,
					t.accepts_cookie && !t.browser ? /* @__PURE__ */ (0, J.jsxs)(J.Fragment, { children: [
						/* @__PURE__ */ (0, J.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, J.jsx)("span", {
								className: "self-start",
								children: /* @__PURE__ */ (0, J.jsx)(E, {
									tone: t.cookie_saved ? "success" : "neutral",
									children: t.cookie_saved ? "Cookie 已保存" : "Cookie 未配置"
								})
							}), /* @__PURE__ */ (0, J.jsx)("p", {
								className: "text-body-2-regular text-text-secondary",
								children: t.cookie_saved ? "登录有效性待验证。" : "需要登录时，任选一种方式提供 Cookie。"
							})]
						}),
						/* @__PURE__ */ (0, J.jsx)(ae, {
							"aria-label": "提供 Cookie 的方式（二选一）",
							value: f,
							onChange: (e) => {
								p(e), A();
							},
							className: ie,
							children: $.map(([t, n]) => /* @__PURE__ */ (0, J.jsx)(e, {
								value: t,
								className: re,
								children: n
							}, t))
						}),
						f === "paste" ? /* @__PURE__ */ (0, J.jsx)(_, {
							type: "password",
							label: "Cookie",
							autoComplete: "off",
							value: o,
							onChange: s
						}) : /* @__PURE__ */ (0, J.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [
								/* @__PURE__ */ (0, J.jsx)(m, { children: "Netscape Cookie 文件（.txt）" }),
								/* @__PURE__ */ (0, J.jsxs)("div", {
									className: "flex flex-wrap items-center gap-3",
									children: [/* @__PURE__ */ (0, J.jsx)(i, {
										variant: "secondary",
										onClick: () => D.current?.click(),
										children: "选择文件"
									}), /* @__PURE__ */ (0, J.jsx)("span", {
										className: "min-w-0 text-body-2-regular break-all text-text-secondary",
										children: g || "未选择文件"
									})]
								}),
								/* @__PURE__ */ (0, J.jsx)("input", {
									ref: D,
									type: "file",
									accept: ".txt",
									tabIndex: -1,
									"aria-hidden": !0,
									className: "hidden",
									onChange: (e) => {
										z(e);
									}
								})
							]
						})
					] }) : null,
					B ? /* @__PURE__ */ (0, J.jsx)(u, { children: B }) : null,
					V.map((e) => /* @__PURE__ */ (0, J.jsx)(b, {
						tone: e.ok ? "success" : "error",
						children: /* @__PURE__ */ (0, J.jsxs)("span", {
							className: "flex flex-col items-start gap-1",
							children: [/* @__PURE__ */ (0, J.jsx)(fe, {
								tone: e.ok ? "success" : "error",
								children: e.ok ? "可访问" : "连接失败"
							}), /* @__PURE__ */ (0, J.jsx)("span", { children: le(e, t.label) })]
						})
					}, e.label))
				]
			}) : null,
			/* @__PURE__ */ (0, J.jsxs)(h, { children: [
				t.accepts_cookie && t.cookie_saved ? /* @__PURE__ */ (0, J.jsx)(i, {
					variant: "secondary",
					onClick: I,
					...k(P),
					children: "撤销 Cookie"
				}) : null,
				/* @__PURE__ */ (0, J.jsx)(i, {
					variant: "secondary",
					onClick: R,
					...k(P),
					children: "检查连接"
				}),
				/* @__PURE__ */ (0, J.jsx)(i, {
					type: "submit",
					...k(P),
					children: "保存"
				})
			] })
		]
	});
}
function ye({ toast: e }) {
	let [t, n] = (0, q.useState)(""), { running: r, outcome: o, start: s } = H({
		queryKey: a,
		queryFn: ({ signal: e }) => P(e),
		start: () => O(x, { code: t }),
		onFinish: (t) => {
			t.status === "complete" && e(t.result || "封面采集完成");
		}
	}), c = (e) => {
		e.preventDefault(), !(r || s.isPending || !t.trim()) && s.mutate();
	}, l = s.error ? j(s.error) : o?.status === "failed" ? o.error || "采集未取得" : "";
	return /* @__PURE__ */ (0, J.jsx)(C, {
		title: "高清封面",
		onSubmit: c,
		children: /* @__PURE__ */ (0, J.jsxs)(T, { children: [
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ (0, J.jsx)(_, {
						"aria-label": "馆藏番号",
						isRequired: !0,
						isDisabled: r,
						value: t,
						onChange: n,
						placeholder: "输入馆藏番号，如 ABW-232"
					})
				}), /* @__PURE__ */ (0, J.jsx)(i, {
					type: "submit",
					disabled: !t.trim(),
					...k(r || s.isPending),
					children: "抓取封面"
				})]
			}),
			r ? /* @__PURE__ */ (0, J.jsx)(y, { label: "正在抓取封面" }) : null,
			l ? /* @__PURE__ */ (0, J.jsx)(b, {
				tone: "error",
				children: l
			}) : null,
			o?.status === "complete" ? /* @__PURE__ */ (0, J.jsx)(b, {
				tone: "success",
				children: o.result || "封面采集完成"
			}) : null
		] })
	});
}
function be({ toast: e }) {
	let { query: a, running: o, outcome: s, start: c } = H({
		queryKey: n,
		queryFn: ({ signal: e }) => N(e),
		start: () => O(r, {}),
		jobOf: (e) => e.job,
		withJob: (e, t) => e && {
			...e,
			job: t
		},
		onFinish: (t) => {
			t.status === "complete" && e(t.result || "amane 桥已重建");
		}
	}), u = U({ mutationFn: () => O(t, {}) }), m = a.data;
	if (!m) return a.error ? /* @__PURE__ */ (0, J.jsx)(C, {
		id: "amane",
		title: "amane",
		children: /* @__PURE__ */ (0, J.jsx)(T, { children: /* @__PURE__ */ (0, J.jsx)(b, {
			tone: "error",
			children: j(a.error)
		}) })
	}) : null;
	let _ = o || c.isPending || u.isPending, v = c.error ? j(c.error) : u.error ? j(u.error) : s?.status === "failed" ? s.error || "重建未完成" : "";
	return /* @__PURE__ */ (0, J.jsxs)(C, {
		id: "amane",
		title: "amane",
		aside: /* @__PURE__ */ (0, J.jsx)(d, {
			href: m.repository,
			leadingIcon: _e,
			children: m.repository
		}),
		children: [
			/* @__PURE__ */ (0, J.jsxs)(p, { children: [
				/* @__PURE__ */ (0, J.jsx)(f, {
					term: "已安装版本",
					children: m.installed_version || "未安装"
				}),
				/* @__PURE__ */ (0, J.jsx)(f, {
					term: "上游最新版本",
					children: u.data?.latest ?? "尚未检查"
				}),
				/* @__PURE__ */ (0, J.jsx)(f, {
					term: "运行环境",
					children: m.installed ? "已安装" : "未安装"
				}),
				/* @__PURE__ */ (0, J.jsxs)(f, {
					term: "内置站点",
					children: [m.sites.length.toLocaleString(), " 个"]
				})
			] }),
			/* @__PURE__ */ (0, J.jsxs)(T, {
				divided: !0,
				children: [
					m.sites.length ? /* @__PURE__ */ (0, J.jsx)(l, {
						summary: "查看内置站点",
						children: /* @__PURE__ */ (0, J.jsx)("p", {
							className: "text-body-2-regular text-text-secondary",
							children: m.sites.map((e) => e.label).join("、")
						})
					}) : null,
					m.problem ? /* @__PURE__ */ (0, J.jsx)(b, {
						tone: "error",
						children: m.problem
					}) : /* @__PURE__ */ (0, J.jsxs)(g, { children: [
						"amane（",
						m.license,
						"）提供这些内置站点的解析能力。首次需要时，Peach 会自动准备锁定的 ",
						m.version,
						" 版本；安装包内已有可用环境时直接使用。 手动安装也使用此版本，不随上游自动升级。"
					] }),
					o ? /* @__PURE__ */ (0, J.jsx)(y, { label: "正在重建运行环境" }) : null,
					v ? /* @__PURE__ */ (0, J.jsx)(b, {
						tone: "error",
						children: v
					}) : null,
					s?.status === "complete" ? /* @__PURE__ */ (0, J.jsx)(b, {
						tone: "success",
						children: s.result || "amane 桥已重建"
					}) : null
				]
			}),
			/* @__PURE__ */ (0, J.jsxs)(h, { children: [/* @__PURE__ */ (0, J.jsx)(i, {
				variant: "secondary",
				onClick: () => {
					_ || u.mutate();
				},
				...k(u.isPending),
				children: "检查上游版本"
			}), /* @__PURE__ */ (0, J.jsx)(i, {
				disabled: !!m.problem,
				onClick: () => {
					_ || c.mutate();
				},
				...k(o || c.isPending),
				children: m.installed ? "重新安装" : "安装"
			})] })
		]
	});
}
function xe({ toast: e }) {
	let t = W({
		queryKey: S,
		queryFn: ({ signal: e }) => I(e)
	}), n = t.data;
	return n ? /* @__PURE__ */ (0, J.jsxs)(G, { children: [
		/* @__PURE__ */ (0, J.jsx)("p", {
			className: "text-body-2-regular text-text-secondary",
			children: "高清图片可能要经代理才能下载，先检查连接。"
		}),
		/* @__PURE__ */ (0, J.jsx)(ye, { toast: e }),
		/* @__PURE__ */ (0, J.jsx)(Y, { receipt: e }),
		(n.sources || []).map((t) => /* @__PURE__ */ (0, J.jsx)(ve, {
			source: t,
			toast: e
		}, t.source)),
		/* @__PURE__ */ (0, J.jsx)(be, { toast: e })
	] }) : /* @__PURE__ */ (0, J.jsx)(G, { children: /* @__PURE__ */ (0, J.jsx)(b, {
		tone: "error",
		title: "采集来源读取失败",
		children: t.error ? j(t.error) : "读取采集来源失败"
	}) });
}
export { xe as ScrapingPage, Q as linkHost, Z as networkOptions };

//# debugId=29f9e346-1df7-4000-acce-466d6653fd1d