import frappe
from frappe import _
from frappe.model.workflow import apply_workflow as frappe_apply_workflow
from frappe.model.workflow import get_transitions as frappe_get_transitions


WORKFLOW_ACTIONS = {"Approve", "Reject"}
PROJECT_FIELDS = ("custom_project_name", "custom_select_project_", "project", "custom_project")


def get_mr_project(doc):
	for fieldname in PROJECT_FIELDS:
		project = doc.get(fieldname) if hasattr(doc, "get") else getattr(doc, fieldname, None)
		if project:
			return project

	return None


def get_project_approvers(project):
	if not project:
		return []

	filters = {
		"project": project,
		"enabled": 1,
	}

	return frappe.get_all(
		"Project Wise MR Approver",
		filters=filters,
		pluck="approver_user",
	)


def is_purchase_officer(user=None):
	user = user or frappe.session.user
	return "Purchase Officer" in frappe.get_roles(user)


@frappe.whitelist()
def can_current_user_approve_mr(material_request_name):
	doc = frappe.get_doc("Material Request", material_request_name)
	doc.check_permission("read")

	project = get_mr_project(doc)
	approvers = get_project_approvers(project) if project else []
	can_approve = True

	if project and not is_purchase_officer():
		can_approve = bool(approvers) and frappe.session.user in approvers

	return {
		"can_approve": can_approve,
		"project": project,
		"approvers": approvers,
	}


def can_user_approve_mr_doc(doc, user=None):
	project = get_mr_project(doc)
	if not project:
		return True

	if is_purchase_officer(user):
		return True

	approvers = get_project_approvers(project)
	return bool(approvers) and (user or frappe.session.user) in approvers


def _get_workflow_action(doc):
	return (
		getattr(doc, "workflow_action", None)
		or frappe.form_dict.get("workflow_action")
		or frappe.form_dict.get("action")
	)


def validate_project_wise_workflow(doc, method=None):
	action = _get_workflow_action(doc)
	if action not in WORKFLOW_ACTIONS:
		return

	if is_purchase_officer():
		return

	project = get_mr_project(doc)
	if not project:
		return

	if can_user_approve_mr_doc(doc):
		return

	frappe.throw(
		_(
			"You are not allowed to {0} Material Request {1} for project {2}. "
			"Only the mapped project approver for this project or a Purchase Officer can perform this action."
		).format(frappe.bold(action), frappe.bold(doc.name), frappe.bold(project)),
		title=_("Project Approval Restricted"),
	)


@frappe.whitelist()
def apply_workflow(doc, action):
	workflow_doc = frappe.get_doc(frappe.parse_json(doc))
	workflow_doc.load_from_db()
	workflow_doc.workflow_action = action
	validate_project_wise_workflow(workflow_doc)
	return frappe_apply_workflow(doc, action)


@frappe.whitelist()
def get_transitions(doc, workflow=None, raise_exception=False):
	workflow_doc = frappe.get_doc(frappe.parse_json(doc))
	workflow_doc.load_from_db()
	transitions = frappe_get_transitions(workflow_doc, workflow, raise_exception)

	if workflow_doc.doctype != "Material Request":
		return transitions

	if workflow_doc.workflow_state != "Pending Approval":
		return transitions

	if can_user_approve_mr_doc(workflow_doc):
		return transitions

	return [
		transition
		for transition in transitions
		if transition.get("action") not in WORKFLOW_ACTIONS
	]


def ensure_workflow_transitions():
	workflow_name = "Procureflow Material Request Approval"
	role = "Material Request Approval"
	condition = (
		'frappe.db.get_value("Project Wise MR Approver", '
		'{"project": (doc.get("custom_project_name") or doc.get("custom_select_project_") '
		'or doc.get("project") or doc.get("custom_project")), '
		'"approver_user": frappe.session.user, "enabled": 1}, "name")'
	)

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
			for transition in workflow.transitions:
				if (
					transition.state == "Pending Approval"
					and transition.action == action
					and transition.next_state == next_state
					and transition.allowed == role
					and transition.condition != condition
				):
					transition.condition = condition
					changed = True
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
				"condition": condition,
				"workflow_builder_id": builder_id,
			},
		)
		changed = True

	if changed:
		workflow.save(ignore_permissions=True)
		frappe.db.commit()
