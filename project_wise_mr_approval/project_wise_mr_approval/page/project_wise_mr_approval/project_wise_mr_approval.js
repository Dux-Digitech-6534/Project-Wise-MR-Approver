frappe.pages["project-wise-mr-approval"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Project Wise MR Approval"),
		single_column: true,
	});

	const root = document.createElement("div");
	root.id = "project-wise-mr-approval-root";
	page.main.empty().append(root);

	ensure_project_wise_mr_assets()
		.then(() => render_project_wise_mr_page(root))
		.catch((error) => {
			root.innerHTML = `<div class="project-wise-mr-page"><div class="project-wise-mr-shell"><div class="project-wise-mr-alert">${frappe.utils.escape_html(error.message || error)}</div></div></div>`;
		});
};

function ensure_project_wise_mr_assets() {
	const css_href = "/assets/project_wise_mr_approval/css/project_wise_mr_approval_page.css";
	if (!document.querySelector(`link[href="${css_href}"]`)) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = css_href;
		document.head.appendChild(link);
	}

	if (window.React && window.ReactDOM) {
		return Promise.resolve();
	}

	return load_project_wise_mr_script("https://unpkg.com/react@18/umd/react.production.min.js").then(() =>
		load_project_wise_mr_script("https://unpkg.com/react-dom@18/umd/react-dom.production.min.js")
	);
}

function load_project_wise_mr_script(src) {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[src="${src}"]`);
		if (existing) {
			existing.addEventListener("load", resolve, { once: true });
			resolve();
			return;
		}

		const script = document.createElement("script");
		script.src = src;
		script.onload = resolve;
		script.onerror = () => reject(new Error(__("Could not load React assets")));
		document.head.appendChild(script);
	});
}

function render_project_wise_mr_page(root) {
	const e = React.createElement;
	const api_method = (method) => `project_wise_mr_approval.api.${method}`;

	function Icon({ name }) {
		const icons = {
			plus: "+",
			refresh: "↻",
			edit: "✎",
			check: "✓",
			close: "×",
			search: "⌕",
			filter: "▾",
			building: "⌂",
			shield: "✓",
			block: "⊘",
			users: "◎",
			warning: "!",
		};
		return e("span", { "aria-hidden": true }, icons[name] || "•");
	}

	function call(method, args) {
		return frappe.call({ method: api_method(method), args }).then((response) => response.message);
	}

	function App() {
		const [rows, setRows] = React.useState([]);
		const [context, setContext] = React.useState({ can_manage: false, is_purchase_officer: false });
		const [options, setOptions] = React.useState({ projects: [], users: [] });
		const [loading, setLoading] = React.useState(true);
		const [saving, setSaving] = React.useState(false);
		const [toggling, setToggling] = React.useState(null);
		const [error, setError] = React.useState("");
		const [search, setSearch] = React.useState("");
		const [status, setStatus] = React.useState("all");
		const [drawer, setDrawer] = React.useState(null);
		const [form, setForm] = React.useState({ project: "", approver_user: "", enabled: 1 });
		const [formErrors, setFormErrors] = React.useState({});

		const canManage = !!context.can_manage;

		function load() {
			setLoading(true);
			setError("");
			Promise.all([
				call("get_mapping_page_context"),
				call("get_mapping_options"),
				call("get_approver_mappings", { search, status }),
			])
				.then(([pageContext, mappingOptions, mappings]) => {
					setContext(pageContext || {});
					setOptions(mappingOptions || { projects: [], users: [] });
					setRows(mappings || []);
				})
				.catch((err) => setError(err.message || __("Could not load approver mappings")))
				.finally(() => setLoading(false));
		}

		React.useEffect(() => {
			load();
		}, []);

		React.useEffect(() => {
			if (!loading) {
				const timeout = setTimeout(() => {
					call("get_approver_mappings", { search, status })
						.then((mappings) => setRows(mappings || []))
						.catch((err) => setError(err.message || __("Could not load approver mappings")));
				}, 250);
				return () => clearTimeout(timeout);
			}
		}, [search, status]);

		const totalProjects = new Set(rows.map((row) => row.project)).size;
		const activeApprovers = rows.filter((row) => row.enabled).length;
		const disabledMappings = rows.filter((row) => !row.enabled).length;

		function openAdd() {
			setDrawer({ mode: "add", row: null });
			setForm({ project: "", approver_user: "", enabled: 1 });
			setFormErrors({});
		}

		function openEdit(row) {
			setDrawer({ mode: "edit", row });
			setForm({
				project: row.project || "",
				approver_user: row.approver_user || "",
				enabled: row.enabled ? 1 : 0,
			});
			setFormErrors({});
		}

		function closeDrawer() {
			setDrawer(null);
			setFormErrors({});
		}

		function save() {
			const errors = {};
			if (!form.project) errors.project = __("Project is required");
			if (!form.approver_user) errors.approver_user = __("Approver User is required");
			setFormErrors(errors);
			if (Object.keys(errors).length) return;

			setSaving(true);
			call("save_approver_mapping", {
				name: drawer && drawer.row ? drawer.row.name : null,
				project: form.project,
				approver_user: form.approver_user,
				enabled: form.enabled ? 1 : 0,
			})
				.then((saved) => {
					frappe.show_alert({ message: __("Approver mapping saved"), indicator: "green" });
					setRows((current) => {
						const exists = current.some((row) => row.name === saved.name);
						if (exists) return current.map((row) => (row.name === saved.name ? saved : row));
						return [saved, ...current];
					});
					closeDrawer();
				})
				.catch((err) => frappe.msgprint(err.message || __("Could not save mapping")))
				.finally(() => setSaving(false));
		}

		function toggleStatus(row) {
			setToggling(row.name);
			call("set_approver_mapping_status", { name: row.name, enabled: row.enabled ? 0 : 1 })
				.then((updated) => {
					setRows((current) =>
						current.map((item) =>
							item.name === updated.name
								? { ...item, enabled: updated.enabled, modified: updated.modified }
								: item
						)
					);
				})
				.catch((err) => frappe.msgprint(err.message || __("Could not update status")))
				.finally(() => setToggling(null));
		}

		return e(
			"div",
			{ className: "project-wise-mr-page" },
			e(
				"div",
				{ className: "project-wise-mr-shell" },
				e(
					"div",
					{ className: "project-wise-mr-header" },
					e(
						"div",
						null,
						e("h1", { className: "project-wise-mr-title" }, __("Project Wise MR Approval")),
						e(
							"p",
							{ className: "project-wise-mr-subtitle" },
							__("Manage project-specific Material Request approvers")
						)
					),
					e(
						"div",
						{ className: "project-wise-mr-actions" },
						e(
							"button",
							{
								className: "project-wise-mr-button project-wise-mr-button-primary",
								disabled: !canManage,
								onClick: openAdd,
							},
							e(Icon, { name: "plus" }),
							__("Add Approver")
						)
					)
				),
				e(
					"div",
					{ className: "project-wise-mr-stats" },
					e(Stat, { icon: "building", tone: "indigo", label: __("Total Projects"), value: totalProjects }),
					e(Stat, { icon: "shield", tone: "green", label: __("Active Approvers"), value: activeApprovers }),
					e(Stat, { icon: "block", tone: "rose", label: __("Disabled Mappings"), value: disabledMappings }),
					e(Stat, {
						icon: "users",
						tone: "slate",
						label: __("PO Override"),
						value: context.is_purchase_officer ? __("Enabled") : "-",
					})
				),
				e(
					"div",
					{ className: "project-wise-mr-toolbar" },
					e(
						"div",
						{ className: "project-wise-mr-toolbar-left" },
						e("input", {
							className: "project-wise-mr-input",
							placeholder: __("Search project or user"),
							value: search,
							onChange: (event) => setSearch(event.target.value),
						}),
						e(
							"select",
							{
								className: "project-wise-mr-select",
								value: status,
								onChange: (event) => setStatus(event.target.value),
							},
							e("option", { value: "all" }, __("All statuses")),
							e("option", { value: "enabled" }, __("Enabled")),
							e("option", { value: "disabled" }, __("Disabled"))
						)
					),
					e(
						"button",
						{ className: "project-wise-mr-button project-wise-mr-button-secondary", onClick: load },
						e("span", { className: loading ? "project-wise-mr-spin" : "" }, e(Icon, { name: "refresh" })),
						__("Refresh")
					)
				),
				error
					? e(
							"div",
							{ className: "project-wise-mr-alert" },
							e("span", null, error),
							e(
								"button",
								{ className: "project-wise-mr-button project-wise-mr-button-secondary", onClick: load },
								__("Retry")
							)
					  )
					: null,
				e(Table, {
					rows,
					loading,
					canManage,
					toggling,
					onAdd: openAdd,
					onEdit: openEdit,
					onToggle: toggleStatus,
				}),
				rows.length
					? e(
							"div",
							{ className: "project-wise-mr-muted", style: { marginTop: "8px" } },
							__("Showing {0} mappings", [rows.length])
					  )
					: null,
				!canManage && !loading
					? e(
							"div",
							{ className: "project-wise-mr-note" },
							e(Icon, { name: "warning" }),
							__("You have read-only access to this list under the Material Request Approval role.")
					  )
					: null,
				drawer
					? e(Drawer, {
							canManage,
							drawer,
							form,
							formErrors,
							options,
							saving,
							setForm,
							onClose: closeDrawer,
							onSave: save,
					  })
					: null
			)
		);
	}

	function Stat({ icon, tone, label, value }) {
		const colors = {
			indigo: ["#eef2ff", "#4f46e5"],
			green: ["#ecfdf5", "#059669"],
			rose: ["#fff1f2", "#e11d48"],
			slate: ["#f1f5f9", "#64748b"],
		};
		const [background, color] = colors[tone] || colors.slate;
		return e(
			"div",
			{ className: "project-wise-mr-stat" },
			e("div", { className: "project-wise-mr-stat-icon", style: { background, color } }, e(Icon, { name: icon })),
			e(
				"div",
				null,
				e("div", { className: "project-wise-mr-stat-label" }, label),
				e("div", { className: "project-wise-mr-stat-value" }, value)
			)
		);
	}

	function Table({ rows, loading, canManage, toggling, onAdd, onEdit, onToggle }) {
		return e(
			"div",
			{ className: "project-wise-mr-table-wrap" },
			e(
				"div",
				{ className: "project-wise-mr-table-scroll" },
				e(
					"table",
					{ className: "project-wise-mr-table" },
					e(
						"thead",
						null,
						e(
							"tr",
							null,
							e("th", null, __("Project")),
							e("th", null, __("Approver User")),
							e("th", null, __("Status")),
							e("th", null, __("Last Modified")),
							e("th", { className: "project-wise-mr-table-actions" }, __("Actions"))
						)
					),
					e(
						"tbody",
						null,
						loading
							? [1, 2, 3, 4, 5].map((item) => e(SkeletonRow, { key: item }))
							: rows.length
							? rows.map((row) =>
									e(MappingRow, {
										key: row.name,
										row,
										canManage,
										toggling,
										onEdit,
										onToggle,
									})
							  )
							: e(EmptyRow, { canManage, onAdd })
					)
				)
			)
		);
	}

	function SkeletonRow() {
		return e(
			"tr",
			null,
			[55, 65, 35, 45, 40].map((width, index) =>
				e(
					"td",
					{ key: index },
					e("span", { className: "project-wise-mr-skeleton", style: { width: `${width}%` } })
				)
			)
		);
	}

	function EmptyRow({ canManage, onAdd }) {
		return e(
			"tr",
			null,
			e(
				"td",
				{ colSpan: 5 },
				e(
					"div",
					{ className: "project-wise-mr-empty" },
					e("div", { className: "project-wise-mr-empty-icon" }, e(Icon, { name: "building" })),
					e("div", null, __("No project approvers configured yet")),
					canManage
						? e(
								"button",
								{
									className: "project-wise-mr-button project-wise-mr-button-primary",
									style: { marginTop: "10px" },
									onClick: onAdd,
								},
								e(Icon, { name: "plus" }),
								__("Add Approver")
						  )
						: null
				)
			)
		);
	}

	function MappingRow({ row, canManage, toggling, onEdit, onToggle }) {
		const enabled = !!row.enabled;
		const busy = toggling === row.name;
		return e(
			"tr",
			null,
			e("td", null, row.project),
			e("td", null, row.approver_user),
			e("td", null, e(StatusBadge, { enabled })),
			e("td", { className: "project-wise-mr-muted" }, frappe.datetime.str_to_user(row.modified)),
			e(
				"td",
				null,
				e(
					"div",
					{ className: "project-wise-mr-row-actions", style: { justifyContent: "flex-end" } },
					e(
						"button",
						{
							className: "project-wise-mr-button project-wise-mr-button-ghost",
							disabled: !canManage,
							onClick: () => onEdit(row),
						},
						e(Icon, { name: "edit" }),
						__("Edit")
					),
					e(
						"button",
						{
							className: `project-wise-mr-button project-wise-mr-button-ghost ${
								enabled ? "project-wise-mr-button-danger" : "project-wise-mr-button-success"
							}`,
							disabled: !canManage || busy,
							onClick: () => onToggle(row),
						},
						busy ? e("span", { className: "project-wise-mr-spin" }, e(Icon, { name: "refresh" })) : e(Icon, { name: enabled ? "block" : "check" }),
						enabled ? __("Disable") : __("Enable")
					)
				)
			)
		);
	}

	function StatusBadge({ enabled }) {
		return e(
			"span",
			{
				className: `project-wise-mr-badge ${
					enabled ? "project-wise-mr-badge-enabled" : "project-wise-mr-badge-disabled"
				}`,
			},
			e("span", {
				className: "project-wise-mr-badge-dot",
				style: { background: enabled ? "#10b981" : "#94a3b8" },
			}),
			enabled ? __("Enabled") : __("Disabled")
		);
	}

	function Drawer({ canManage, drawer, form, formErrors, options, saving, setForm, onClose, onSave }) {
		const title = drawer.mode === "edit" ? __("Edit Approver Mapping") : __("Add Approver Mapping");
		return e(
			"div",
			{ className: "project-wise-mr-drawer-overlay", onMouseDown: onClose },
			e(
				"div",
				{ className: "project-wise-mr-drawer", onMouseDown: (event) => event.stopPropagation() },
				e(
					"div",
					{ className: "project-wise-mr-drawer-header" },
					e(
						"div",
						null,
						e("h2", { className: "project-wise-mr-title", style: { fontSize: "14px" } }, title),
						e(
							"p",
							{ className: "project-wise-mr-subtitle" },
							drawer.mode === "edit" ? drawer.row.name : __("Create a new project-approver link")
						)
					),
					e(
						"button",
						{ className: "project-wise-mr-button project-wise-mr-button-ghost", onClick: onClose },
						e(Icon, { name: "close" })
					)
				),
				e(
					"div",
					{ className: "project-wise-mr-drawer-body" },
					!canManage
						? e(
								"div",
								{ className: "project-wise-mr-note", style: { marginTop: 0, marginBottom: "16px" } },
								e(Icon, { name: "warning" }),
								__("Your role has read-only access. Changes cannot be saved.")
						  )
						: null,
					e(SelectField, {
						label: __("Project"),
						required: true,
						value: form.project,
						disabled: !canManage,
						error: formErrors.project,
						options: options.projects.map((project) => ({ value: project, label: project })),
						onChange: (value) => setForm((current) => ({ ...current, project: value })),
					}),
					e(SelectField, {
						label: __("Approver User"),
						required: true,
						value: form.approver_user,
						disabled: !canManage,
						error: formErrors.approver_user,
						options: options.users.map((user) => ({
							value: user.name,
							label: user.label === user.name ? user.name : `${user.label} (${user.name})`,
						})),
						onChange: (value) => setForm((current) => ({ ...current, approver_user: value })),
					}),
					e(
						"div",
						{ className: "project-wise-mr-toggle-row" },
						e(
							"div",
							null,
							e("div", { className: "project-wise-mr-label", style: { marginBottom: 2 } }, __("Enabled")),
							e(
								"div",
								{ className: "project-wise-mr-muted" },
								__("Allow this user to approve MRs for this project")
							)
						),
						e(
							"button",
							{
								type: "button",
								className: `project-wise-mr-toggle ${form.enabled ? "project-wise-mr-toggle-active" : ""}`,
								disabled: !canManage,
								onClick: () => setForm((current) => ({ ...current, enabled: current.enabled ? 0 : 1 })),
							},
							e("span")
						)
					)
				),
				e(
					"div",
					{ className: "project-wise-mr-drawer-footer" },
					e(
						"button",
						{ className: "project-wise-mr-button project-wise-mr-button-secondary", onClick: onClose },
						e(Icon, { name: "close" }),
						__("Cancel")
					),
					canManage
						? e(
								"button",
								{
									className: "project-wise-mr-button project-wise-mr-button-primary",
									disabled: saving,
									onClick: onSave,
								},
								saving ? e("span", { className: "project-wise-mr-spin" }, e(Icon, { name: "refresh" })) : e(Icon, { name: "check" }),
								saving ? __("Saving") : __("Save")
						  )
						: null
				)
			)
		);
	}

	function SelectField({ label, required, value, disabled, error, options, onChange }) {
		return e(
			"div",
			{ className: "project-wise-mr-field" },
			e(
				"label",
				{ className: "project-wise-mr-label" },
				label,
				required ? e("span", { style: { color: "#e11d48" } }, " *") : null
			),
			e(
				"select",
				{
					className: "project-wise-mr-select",
					value,
					disabled,
					onChange: (event) => onChange(event.target.value),
				},
				e("option", { value: "" }, __("Select {0}", [label])),
				options.map((option) =>
					e("option", { key: option.value, value: option.value }, option.label)
				)
			),
			error ? e("div", { className: "project-wise-mr-error-text" }, error) : null
		);
	}

	ReactDOM.createRoot(root).render(e(App));
}
