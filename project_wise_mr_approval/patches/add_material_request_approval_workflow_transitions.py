import frappe


def execute():
	workflow_name = "Procureflow Material Request Approval"
	role = "Material Request Approval"

	if not frappe.db.exists("Workflow", workflow_name):
		return

	if not frappe.db.exists("Role", role):
		return

	workflow = frappe.get_doc("Workflow", workflow_name)
	changed = False

	for action, next_state, builder_id in (
		("Approve", "Approved", "action-project-wise-approve"),
		("Reject", "Rejected", "action-project-wise-reject"),
	):
		exists = any(
			transition.state == "Pending Approval"
			and transition.action == action
			and transition.next_state == next_state
			and transition.allowed == role
			for transition in workflow.transitions
		)
		if exists:
			continue

		workflow.append(
			"transitions",
			{
				"state": "Pending Approval",
				"action": action,
				"next_state": next_state,
				"allowed": role,
				"allow_self_approval": 1,
				"send_email_to_creator": 0,
				"workflow_builder_id": builder_id,
			},
		)
		changed = True

	if changed:
		workflow.save(ignore_permissions=True)
