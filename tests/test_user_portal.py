import os
import sys
import json
import io
from fastapi.testclient import TestClient

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.app.main import app

def test_user_portal():
    client = TestClient(app)
    print("Testing User Portal Endpoints...")

    # 1. Test Counsellors
    resp = client.get("/api/user/counsellors")
    assert resp.status_code == 200
    counsellors = resp.json()
    assert len(counsellors) == 2
    print("[PASS] Counsellors retrieved successfully:", [c["name"] for c in counsellors])

    # 2. Test Resources
    resp = client.get("/api/user/resources")
    assert resp.status_code == 200
    res_data = resp.json()
    assert len(res_data["categories"]) == 6
    assert len(res_data["quick_exercises"]) == 3
    print("[PASS] Resources retrieved successfully (6 categories, 3 quick exercises)")

    # 3. Test Rohan & Ananya Home Snapshots
    users = [
        ("Rohan", "79fdd39b-4ccf-4778-a1c7-82712f08f051"),
        ("Ananya Patel", "60895178-7a8b-4392-961b-ac82d4b7ec0c")
    ]
    for name, uid in users:
        resp = client.get(f"/api/user/{uid}/home-snapshot")
        assert resp.status_code == 200
        snapshot = resp.json()
        assert "activity" in snapshot and "steps_today" in snapshot["activity"]
        assert "nearby_place" in snapshot and "name" in snapshot["nearby_place"]
        assert "sleep" in snapshot and "duration_formatted" in snapshot["sleep"]
        print(f"[PASS] Snapshot for {name}: Steps={snapshot['activity']['steps_today']}, Nearby={snapshot['nearby_place']['name']}, Sleep={snapshot['sleep']['duration_formatted']} ({snapshot['sleep']['time_range']})")

    # 4. Test Appointments Retrieval & Reschedule for Rohan
    rohan_uid = "79fdd39b-4ccf-4778-a1c7-82712f08f051"
    resp = client.get(f"/api/user/{rohan_uid}/appointments")
    assert resp.status_code == 200
    appts = resp.json()
    assert len(appts["upcoming"]) >= 1
    first_appt = appts["upcoming"][0]
    print(f"[PASS] Appointments for Rohan: {len(appts['upcoming'])} upcoming, {len(appts['past'])} past")

    # Reschedule
    reschedule_payload = {
        "new_date": "2026-09-25",
        "new_time": "03:30 PM IST"
    }
    resp = client.post(
        f"/api/user/{rohan_uid}/appointments/{first_appt['id']}/reschedule",
        json=reschedule_payload
    )
    assert resp.status_code == 200
    resched_res = resp.json()
    assert resched_res["success"] is True
    print(f"[PASS] Rescheduled appointment {first_appt['id']} to {resched_res['appointment']['date']}")

    # 5. Test Case Updates
    resp = client.get(f"/api/user/{rohan_uid}/case-updates")
    assert resp.status_code == 200
    case_updates = resp.json()
    assert "milestones" in case_updates
    print(f"[PASS] Case updates for Rohan: ref={case_updates['case_ref']}, milestones={len(case_updates['milestones'])}")

    # 6. Test Document Upload and Download
    filename = "Mental_Health_Support_Form.docx"
    file_content = b"Sample docx content for testing user case document upload."
    
    resp = client.post(
        f"/api/user/{rohan_uid}/documents/upload",
        files={"file": (filename, file_content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    )
    assert resp.status_code == 200
    uploaded_doc = resp.json()
    print(f"[PASS] Uploaded document: {uploaded_doc['file_name']}, ID: {uploaded_doc['id']}")

    # Download doc
    resp = client.get(f"/api/user/{rohan_uid}/documents/{uploaded_doc['id']}/download")
    assert resp.status_code == 200
    assert resp.content == file_content
    print(f"[PASS] Successfully downloaded document {uploaded_doc['id']} ({len(resp.content)} bytes matches)")

    print("\nALL USER PORTAL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_user_portal()
