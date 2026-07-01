import frappe
from frappe import _
from frappe.model.workflow import apply_workflow as frappe_apply_workflow
from frappe.model.workflow import get_transitions as frappe_get_transitions
from frappe.utils import cint


WORKFLOW_ACTIONS = {"Approve", "Reject"}
PROJECT_FIELDS = ("custom_project_name", "custom_select_project_", "project", "custom_project")
APPROVER_DOCTYPE = "Project Wise MR Approver"


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
		APPROVER_DOCTYPE,
		filters=filters,
		pluck="approver_user",
	)


def can_manage_approver_mappings(user=None):
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	return "System Manager" in roles or "Purchase Officer" in roles


def _check_read_permission():
	if not frappe.has_permission(APPROVER_DOCTYPE, "read"):
		frappe.throw(_("Not permitted to read Project Wise MR Approver"), frappe.PermissionError)


def _check_write_permission():
	if not can_manage_approver_mappings():
		frappe.throw(_("Only System Manager or Purchase Officer can manage approver mappings."), frappe.PermissionError)


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


@frappe.whitelist()
def get_mapping_page_context():
	_check_read_permission()
	roles = frappe.get_roles(frappe.session.user)

	return {
		"can_manage": can_manage_approver_mappings(),
		"is_purchase_officer": "Purchase Officer" in roles,
		"roles": roles,
	}


@frappe.whitelist()
def get_approver_mappings(search=None, status="all"):
	_check_read_permission()
	filters = {}

	if status == "enabled":
		filters["enabled"] = 1
	elif status == "disabled":
		filters["enabled"] = 0

	or_filters = None
	if search:
		or_filters = {
			"project": ["like", f"%{search}%"],
			"approver_user": ["like", f"%{search}%"],
		}

	return frappe.get_all(
		APPROVER_DOCTYPE,
		filters=filters,
		or_filters=or_filters,
		fields=["name", "project", "approver_user", "enabled", "modified"],
		order_by="modified desc",
	)


@frappe.whitelist()
def get_mapping_options():
	_check_read_permission()

	projects = frappe.get_all(
		"Project Master",
		fields=["name"],
		order_by="name asc",
		limit_page_length=0,
	)
	users = frappe.get_all(
		"User",
		filters={"enabled": 1},
		fields=["name", "full_name"],
		order_by="full_name asc",
		limit_page_length=0,
	)

	return {
		"projects": [project.name for project in projects],
		"users": [
			{
				"name": user.name,
				"label": user.full_name or user.name,
			}
			for user in users
		],
	}


@frappe.whitelist()
def save_approver_mapping(name=None, project=None, approver_user=None, enabled=1):
	_check_write_permission()

	if not project:
		frappe.throw(_("Project is required."))
	if not approver_user:
		frappe.throw(_("Approver User is required."))

	if name:
		doc = frappe.get_doc(APPROVER_DOCTYPE, name)
	else:
		doc = frappe.new_doc(APPROVER_DOCTYPE)

	doc.project = project
	doc.approver_user = approver_user
	doc.enabled = 1 if cint(enabled) else 0
	doc.save()

	return {
		"name": doc.name,
		"project": doc.project,
		"approver_user": doc.approver_user,
		"enabled": doc.enabled,
		"modified": doc.modified,
	}


@frappe.whitelist()
def set_approver_mapping_status(name, enabled):
	_check_write_permission()

	doc = frappe.get_doc(APPROVER_DOCTYPE, name)
	doc.enabled = 1 if cint(enabled) else 0
	doc.save()

	return {
		"name": doc.name,
		"enabled": doc.enabled,
		"modified": doc.modified,
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
	# This app governs Material Request approval ONLY. Other doctypes (e.g. Purchase
	# Order, which also has a "Reject" action and carries custom_project_name) must
	# never be caught by this project-approval check.
	if getattr(doc, "doctype", None) != "Material Request":
		return

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
