import frappe
from frappe import _
from frappe.utils import cint


APPROVER_DOCTYPE = "Project Wise MR Approver"


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
