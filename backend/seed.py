from __future__ import annotations

import sys
from typing import Any

from app.services.supabase_client import get_supabase_admin
from app.services.demo_directory_seed import DEMO_COURSES, DEMO_FACULTY, ensure_demo_directory_seed


DUMMY_USERS = {
    "admin@unigpt.edu": {
        "password": "admin-password-123",
        "full_name": "Admin User",
        "role": "admin",
        "department": "Administration",
    },
    "faculty@unigpt.edu": {
        "password": "faculty-password-123",
        "full_name": "Faculty User",
        "role": "faculty",
        "department": "Computer Science",
    },
    "student@unigpt.edu": {
        "password": "student-password-123",
        "full_name": "Student User",
        "role": "student",
        "department": "Computer Science",
    },
}


def _extract_auth_users(users_response: Any) -> list[Any]:
    if isinstance(users_response, list):
        return users_response
    if hasattr(users_response, "users"):
        return list(getattr(users_response, "users") or [])
    if isinstance(users_response, dict) and isinstance(users_response.get("users"), list):
        return users_response["users"]
    return []


def _auth_user_email(user: Any) -> str:
    if isinstance(user, dict):
        return str(user.get("email") or "")
    return str(getattr(user, "email", "") or "")


def _auth_user_id(user: Any) -> str:
    if isinstance(user, dict):
        return str(user.get("id") or "")
    return str(getattr(user, "id", "") or "")


def seed_dummy_users(admin: Any) -> None:
    print("Seeding dummy auth users + profiles...")

    existing_users_by_email: dict[str, str] = {}
    try:
        users = _extract_auth_users(admin.auth.admin.list_users())
        for user in users:
            email = _auth_user_email(user).strip().lower()
            if email in DUMMY_USERS:
                existing_users_by_email[email] = _auth_user_id(user)
    except Exception as exc:
        print(f"Warning: could not list auth users: {exc}")

    for email, data in DUMMY_USERS.items():
        normalized_email = email.strip().lower()
        user_id = existing_users_by_email.get(normalized_email)

        if not user_id:
            try:
                created = admin.auth.admin.create_user(
                    {
                        "email": email,
                        "password": data["password"],
                        "email_confirm": True,
                        "user_metadata": {
                            "full_name": data["full_name"],
                            "role": data["role"],
                            "department": data["department"],
                        },
                    }
                )
                user_id = _auth_user_id(getattr(created, "user", None))
                print(f"Created auth user: {email}")
            except Exception as exc:
                print(f"Failed to create auth user {email}: {exc}")
                continue
        else:
            print(f"Auth user already exists: {email}")

        try:
            admin.table("profiles").upsert(
                {
                    "id": user_id,
                    "email": email,
                    "full_name": data["full_name"],
                    "role": data["role"],
                    "department": data["department"],
                },
                on_conflict="id",
            ).execute()
            print(f"Synced profile: {email}")
        except Exception as exc:
            print(f"Failed profile sync for {email}: {exc}")

    print("Dummy user seed complete.")


def delete_all_seeded_data(admin: Any) -> None:
    print("Deleting seeded demo records (dummy users + demo faculty + seeded documents)...")

    demo_doc_filenames = [str(item.get("filename") or "") for item in DEMO_COURSES if item.get("filename")]
    if demo_doc_filenames:
        try:
            admin.table("documents").delete().in_("filename", demo_doc_filenames).execute()
            print(f"Deleted demo documents by filename ({len(demo_doc_filenames)} targets).")
        except Exception as exc:
            print(f"Warning: failed deleting demo documents: {exc}")

    seed_emails = sorted(
        set(list(DUMMY_USERS.keys()) + [str(item.get("email") or "") for item in DEMO_FACULTY if item.get("email")])
    )

    try:
        users = _extract_auth_users(admin.auth.admin.list_users())
    except Exception as exc:
        print(f"Warning: could not list auth users for deletion: {exc}")
        users = []

    for user in users:
        email = _auth_user_email(user).strip().lower()
        if email not in {e.lower() for e in seed_emails}:
            continue
        user_id = _auth_user_id(user)
        try:
            admin.auth.admin.delete_user(user_id)
            print(f"Deleted auth user: {email}")
        except Exception as exc:
            print(f"Warning: failed deleting auth user {email}: {exc}")

    try:
        admin.table("profiles").delete().in_("email", seed_emails).execute()
    except Exception:
        pass

    print("Seeded data delete complete.")


def usage() -> None:
    print("Usage:")
    print("  python seed.py seed_all      # seed dummy users + demo faculty/course data")
    print("  python seed.py delete_all    # delete all seeded dummy/demo records")
    print("  python seed.py reset         # delete_all then seed_all")
    print("  python seed.py seed_dummy    # seed only dummy login users")
    print("  python seed.py seed_demo     # seed only demo faculty/course records")
    print("  python seed.py               # interactive menu")


def interactive_menu() -> str:
    options = {
        "1": "seed_all",
        "2": "delete_all",
        "3": "reset",
        "4": "seed_dummy",
        "5": "seed_demo",
        "0": "exit",
    }
    print("\n=== UnivGPT Seed Menu ===")
    print("1) seed_all")
    print("2) delete_all")
    print("3) reset")
    print("4) seed_dummy")
    print("5) seed_demo")
    print("0) exit")
    choice = input("Choose option [0-5]: ").strip()
    return options.get(choice, "")


def main() -> None:
    command = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    if not command:
        command = interactive_menu()
        if command == "exit":
            print("Exited.")
            return
        if not command:
            print("Invalid selection.")
            usage()
            return

    admin = get_supabase_admin()

    match command:
        case "seed_all":
            seed_dummy_users(admin)
            ensure_demo_directory_seed()
            print("seed_all completed.")
        case "delete_all":
            delete_all_seeded_data(admin)
            print("delete_all completed.")
        case "reset":
            delete_all_seeded_data(admin)
            seed_dummy_users(admin)
            ensure_demo_directory_seed()
            print("reset completed.")
        case "seed_dummy":
            seed_dummy_users(admin)
            print("seed_dummy completed.")
        case "seed_demo":
            ensure_demo_directory_seed()
            print("seed_demo completed.")
        case _:
            print(f"Unknown command: {command}")
            usage()


if __name__ == "__main__":
    main()
