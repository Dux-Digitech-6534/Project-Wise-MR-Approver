# Project Wise MR Approval

Project Wise MR Approval ek Frappe/ERPNext custom app hai jo Material Request approval ko selected project ke approver ke according control karta hai.

## Purpose

Is app ka main purpose ye hai:

- Material Request me selected project ke basis par approver decide karna.
- Har project ke liye specific user ko approver set karna.
- Sirf mapped project approver ko us project ki Material Request approve/reject karne dena.
- Purchase Officer role wale users ko all-project approval access dena.
- Galat project ke approver ko Action button se approve/reject karne se rokna.

## App Details

| Item | Value |
| --- | --- |
| App Name | `project_wise_mr_approval` |
| App Title | Project Wise MR Approval |
| Publisher | Dux Digital |
| License | MIT |
| Target DocType | Material Request |
| Setting DocType | Project Wise MR Approver |
| Project Link DocType | Project Master |

## Repository

```bash
https://github.com/Dux-Digitech-6534/Project-Wise-MR-Approver.git
```

Branch:

```bash
development
```

## Installation

Bench folder me jaakar app install karein:

```bash
cd /home/dux/frappe-bench
bench get-app https://github.com/Dux-Digitech-6534/Project-Wise-MR-Approver.git --branch development
bench --site app.duxdigitech.in install-app project_wise_mr_approval
bench --site app.duxdigitech.in migrate
bench build --app project_wise_mr_approval
bench restart
```

Existing app update karne ke liye:

```bash
cd /home/dux/frappe-bench/apps/project_wise_mr_approval
git pull origin development
cd /home/dux/frappe-bench
bench --site app.duxdigitech.in migrate
bench build --app project_wise_mr_approval
bench restart
```

## Setting DocType

App me ek custom DocType hai:

```text
Project Wise MR Approver
```

Fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| Project | Link | Yes | `Project Master` se project select hota hai |
| Approver User | Link | Yes | `User` se approver select hota hai |
| Enabled | Check | No | Enabled record hi approval me count hota hai |

## Approval Rule

Material Request ka workflow state jab `Pending Approval` hota hai, tab app ye rule apply karta hai:

1. Material Request me project read kiya jata hai.
2. Project Wise MR Approver me us project ka enabled approver search hota hai.
3. Agar current user us project ka mapped approver hai, to Approve/Reject allowed hai.
4. Agar current user ke paas `Purchase Officer` role hai, to Approve/Reject allowed hai.
5. Agar current user project approver nahi hai aur Purchase Officer bhi nahi hai, to Approve/Reject hide/block hota hai.

## Supported Project Fields

Material Request me app in fields me se project detect karta hai:

```python
custom_project_name
custom_select_project_
project
custom_project
```

Jo field pehle value ke saath milegi, us project ko approval mapping ke liye use kiya jayega.

## Roles

### System Manager

System Manager ko `Project Wise MR Approver` setting records create, edit aur delete karne ka access hai.

### Purchase Officer

Purchase Officer:

- Project Wise MR Approver setting read/write kar sakta hai.
- Kisi bhi project ki Material Request approve/reject kar sakta hai.
- Project-wise restriction se bypass hota hai.

### Material Request Approval

Material Request Approval role:

- Project Wise MR Approver setting read kar sakta hai.
- Sirf mapped project ke liye Material Request approve/reject kar sakta hai.

## Workflow Integration

App Material Request workflow ke liye approve/reject transitions ko project-wise condition se secure karta hai.

Workflow name:

```text
Procureflow Material Request Approval
```

Workflow state:

```text
Pending Approval
```

Actions controlled by this app:

```text
Approve
Reject
```

Allowed role used for project-wise approval:

```text
Material Request Approval
```

## Frontend Behavior

Material Request form par app ka JavaScript run hota hai.

If user approval ke liye allowed nahi hai:

- `Approve` action hide hota hai.
- `Reject` action hide hota hai.
- Action dropdown reload/delay ke baad bhi hide rakha jata hai.

Important: Frontend hide sirf user experience ke liye hai. Actual security backend workflow override me enforced hai.

## Backend Security

App Frappe ke workflow methods override karta hai:

```python
frappe.model.workflow.apply_workflow
frappe.model.workflow.get_transitions
```

Isse agar koi user browser console/API se manually workflow action call kare, tab bhi validation hoti hai.

Invalid approval par error aata hai:

```text
Project Approval Restricted
```

## Example

Project Wise MR Approver setting:

| Project | Approver User | Enabled |
| --- | --- | --- |
| Green Valley Heights | test@test.com | Yes |

Result:

- `test@test.com` Green Valley Heights ki MR approve/reject kar sakta hai.
- `test@test.com` Skyline project ki MR approve/reject nahi kar sakta.
- Purchase Officer role wala user dono projects ki MR approve/reject kar sakta hai.

## Smoke Test

Bench console se basic check:

```bash
cd /home/dux/frappe-bench
bench --site app.duxdigitech.in console
```

Console me:

```python
from project_wise_mr_approval.api import can_user_approve_mr_doc

doc = frappe.get_doc("Material Request", "MAT-MR-2026-00487")
can_user_approve_mr_doc(doc, "test@test.com")
```

Expected:

```python
True
```

Wrong project ke liye:

```python
doc = frappe.get_doc("Material Request", "MAT-MR-2026-00488")
can_user_approve_mr_doc(doc, "test@test.com")
```

Expected:

```python
False
```

## Browser Test

1. `test@test.com` user se login karein.
2. Green Valley Heights project wali Pending Approval MR open karein.
3. Action dropdown me Approve/Reject visible hona chahiye.
4. Skyline project wali Pending Approval MR open karein.
5. Action dropdown me Approve/Reject visible nahi hona chahiye.
6. Agar button visible ho bhi jaye, click karne par backend approval block hona chahiye.

## Troubleshooting

### Approve button wrong project me dikh raha hai

Check karein:

- Material Request ka project field correct hai.
- Project Wise MR Approver me same project name mapped hai.
- User ke paas `Purchase Officer` role to nahi hai.
- User ka record enabled hai ya nahi.
- Browser cache clear karke hard reload karein.

### User correct project me approve nahi kar pa raha

Check karein:

- User `Project Wise MR Approver` me exact project ke saath mapped hai.
- `Enabled` checked hai.
- User disabled nahi hai.
- Material Request `Pending Approval` state me hai.
- Workflow name `Procureflow Material Request Approval` exist karta hai.
- Role `Material Request Approval` exist karta hai.

### Workflow transition apply nahi ho raha

Run:

```bash
bench --site app.duxdigitech.in migrate
bench --site app.duxdigitech.in execute project_wise_mr_approval.api.ensure_workflow_transitions
bench restart
```

## Important Notes

- Company field is app ke approval setting me use nahi hota.
- Approval mapping only project ke according hoti hai.
- Project field `Project Master` custom DocType se linked hai.
- Purchase Officer role ko all-project approval access intentionally diya gaya hai.
- Frontend hide ke saath backend validation bhi active hai.

## Files

Important files:

```text
project_wise_mr_approval/api.py
project_wise_mr_approval/hooks.py
project_wise_mr_approval/public/js/material_request.js
project_wise_mr_approval/project_wise_mr_approval/doctype/project_wise_mr_approver/project_wise_mr_approver.json
```
