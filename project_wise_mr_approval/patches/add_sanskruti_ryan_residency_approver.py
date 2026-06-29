import frappe


def execute():
	project = "Sanskruti Ryan Residency"
	approver_user = "mritiunjay.sanskruti@gmail.com"

	if not frappe.db.exists("Project Master", project):
		return

	if not frappe.db.exists("User", approver_user):
		return

	exists = frappe.db.exists(
		"Project Wise MR Approver",
		{
			"project": project,
			"approver_user": approver_user,
		},
	)
	if exists:
		return

	doc = frappe.new_doc("Project Wise MR Approver")
	doc.project = project
	doc.approver_user = approver_user
	doc.enabled = 1
	doc.insert(ignore_permissions=True)
