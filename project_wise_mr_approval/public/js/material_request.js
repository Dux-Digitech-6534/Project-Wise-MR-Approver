frappe.ui.form.on("Material Request", {
	refresh(frm) {
		if (frm.doc.workflow_state !== "Pending Approval" || frm.is_new()) {
			return;
		}

		frappe.call({
			method: "project_wise_mr_approval.api.can_current_user_approve_mr",
			args: {
				material_request_name: frm.doc.name,
			},
			callback(r) {
				if (r.message && !r.message.can_approve) {
					hide_workflow_actions();
					keep_workflow_actions_hidden();
				}
			},
		});
	},
});

function keep_workflow_actions_hidden() {
	[100, 300, 700, 1200, 2000].forEach((delay) => {
		setTimeout(() => hide_workflow_actions(), delay);
	});
}

function hide_workflow_actions() {
	const actions_to_hide = ["Approve", "Reject"];
	const is_target_action = (text) => actions_to_hide.includes((text || "").trim());

	$(document)
		.find("button, a.dropdown-item, .dropdown-item, a")
		.each(function () {
			const $item = $(this);
			const label = $item.clone().children().remove().end().text().trim();
			if (is_target_action(label) || is_target_action($item.text())) {
				$item.hide();
			}
		});
}
