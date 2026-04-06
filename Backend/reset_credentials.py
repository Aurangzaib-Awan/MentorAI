#!/usr/bin/env python3

from seed_accounts import ensure_seed_accounts
import os
from dotenv import load_dotenv

if __name__ == "__main__":
    load_dotenv()
    
    print("🔄 Resetting credentials for admin, hr, and mentor accounts...")
    try:
        # Load from environment
        admin_pwd = os.getenv("ADMIN_PASSWORD")
        hr_pwd = os.getenv("HR_PASSWORD")
        mentor_pwd = os.getenv("MENTOR_PASSWORD")
        
        if not admin_pwd or not hr_pwd or not mentor_pwd:
            print("❌ Error: Missing required environment variables!")
            print("Please set these in Backend/.env:")
            print("  - ADMIN_PASSWORD")
            print("  - HR_PASSWORD")
            print("  - MENTOR_PASSWORD")
            print("\nSee .env.example for template.")
            exit(1)
        
        ensure_seed_accounts()
        
        print("✅ Credentials reset successfully!")
        print("\nAccounts created/updated:")
        print(f"  • admin@immersia.com / {admin_pwd}")
        print(f"  • hr@immersia.com / {hr_pwd}")
        print(f"  • mentor@immersia.com / {mentor_pwd}")
    except Exception as e:
        print(f"❌ Error resetting credentials: {e}")
        import traceback
        traceback.print_exc()
