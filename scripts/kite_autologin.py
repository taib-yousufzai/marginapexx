import requests
import pyotp
import os
import json
import sys
from datetime import datetime, timedelta, timezone
from kiteconnect import KiteConnect
from urllib.parse import urlparse, parse_qs

def kite_token_expires_at():
    # Kite tokens expire at 06:00 IST (00:30 UTC) the next day
    now = datetime.now(timezone.utc)
    expiry = now.replace(hour=0, minute=30, second=0, microsecond=0)
    if expiry <= now:
        expiry += timedelta(days=1)
    return expiry

def main():
    print("Starting Kite Python auto-login...")
    
    # ── Load Env Vars ────────────────────────────────────────────────────────
    user_id = os.getenv('ZERODHA_USER_ID')
    password = os.getenv('ZERODHA_PASSWORD')
    totp_secret = os.getenv('ZERODHA_TOTP_SECRET')
    api_key = os.getenv('NEXT_PUBLIC_KITE_API_KEY') or os.getenv('KITE_API_KEY')
    api_secret = os.getenv('KITE_API_SECRET')
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    supabase_user_id = os.getenv('ZERODHA_SUPABASE_USER_ID')

    if not all([user_id, password, totp_secret, api_key, api_secret, supabase_url, supabase_key, supabase_user_id]):
        print("Missing required environment variables.")
        sys.exit(1)

    # ── Step 1: Initialize Session ───────────────────────────────────────────
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    # ── Step 2: Login ────────────────────────────────────────────────────────
    print("Posting to login API...")
    login_res = session.post('https://kite.zerodha.com/api/login', data={
        'user_id': user_id,
        'password': password
    })
    
    login_data = login_res.json()
    if login_data.get('status') != 'success':
        print(f"Login failed: {login_data}")
        sys.exit(1)
    
    request_id = login_data['data']['request_id']
    print(f"Login success, got request_id: {request_id}")

    # ── Step 3: Two-Factor Auth (TOTP) ───────────────────────────────────────
    print("Generating and posting TOTP...")
    totp = pyotp.TOTP(totp_secret.replace(" ", ""))
    otp_code = totp.now()
    
    twofa_res = session.post('https://kite.zerodha.com/api/twofa', data={
        'user_id': user_id,
        'request_id': request_id,
        'twofa_value': otp_code,
        'skip_session': ''
    })
    
    twofa_data = twofa_res.json()
    if twofa_data.get('status') != 'success':
        print(f"TwoFA failed: {twofa_data}")
        sys.exit(1)
    
    print("TwoFA success.")

    # ── Step 4: Get Request Token via OAuth Redirect ─────────────────────────
    print("Fetching OAuth redirect...")
    connect_url = f"https://kite.trade/connect/login?v=3&api_key={api_key}&skip_session=true"
    
    # We follow redirects manually to avoid the "Connection Refused" error when 
    # it tries to hit the local redirect URL (127.0.0.1:3000)
    current_url = connect_url
    request_token = None
    
    for _ in range(5):  # Max 5 redirects
        res = session.get(current_url, allow_redirects=False)
        if 'Location' in res.headers:
            current_url = res.headers['Location']
            print(f"Redirecting to: {current_url}")
            if 'request_token=' in current_url:
                parsed_url = urlparse(current_url)
                request_token = parse_qs(parsed_url.query).get('request_token', [None])[0]
                break
        else:
            # If no Location header, maybe we are already at the destination
            if 'request_token=' in res.url:
                parsed_url = urlparse(res.url)
                request_token = parse_qs(parsed_url.query).get('request_token', [None])[0]
            break

    if not request_token:
        print(f"Failed to capture request_token. Final URL: {current_url}")
        sys.exit(1)
    
    print(f"Captured request_token: {request_token}")

    # ── Step 5: Generate Session (Exchange Token) ────────────────────────────
    print("Exchanging request_token for access_token...")
    kite = KiteConnect(api_key=api_key)
    data = kite.generate_session(request_token, api_secret=api_secret)
    
    access_token = data['access_token']
    kite_user_id = data['user_id']
    expires_at = kite_token_expires_at()
    
    print(f"Got access_token for {kite_user_id}, expires at {expires_at.isoformat()}")

    # ── Step 6: Update Supabase ──────────────────────────────────────────────
    print("Updating Supabase...")
    supabase_endpoint = f"{supabase_url}/rest/v1/kite_sessions"
    
    # Upsert logic (on_conflict user_id)
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {supabase_key}',
        'apikey': supabase_key,
        'Prefer': 'resolution=merge-duplicates'
    }
    
    payload = {
        'user_id': supabase_user_id,
        'kite_user_id': kite_user_id,
        'access_token': access_token,
        'expires_at': expires_at.isoformat()
    }
    
    res = requests.post(supabase_endpoint, headers=headers, data=json.dumps(payload))
    
    if res.status_code in [200, 201, 204]:
        print("✅ Kite session saved successfully to Supabase.")
    else:
        print(f"❌ Failed to save to Supabase: {res.status_code} {res.text}")

if __name__ == "__main__":
    main()
