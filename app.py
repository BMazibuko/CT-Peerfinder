import os
import uuid
import io
import json
import re
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import pandas as pd
import boto3
from botocore.exceptions import ClientError
import logging
from dotenv import load_dotenv
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# === CONFIGURATION ===
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.environ.get('SECRET_KEY', "ct-e8f3473b716cfe3760fd522e38a3bd5b9909510b0ef003f050e0a445fa3a6e83")
app.secret_key = SECRET_KEY

AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_DEFAULT_REGION = os.environ.get('AWS_DEFAULT_REGION')
AWS_S3_BUCKET = os.environ.get('AWS_S3_BUCKET', 'alx-peerfinder-storage-bucket')

s3 = boto3.client('s3', aws_access_key_id=AWS_ACCESS_KEY_ID, aws_secret_access_key=AWS_SECRET_ACCESS_KEY, region_name=AWS_DEFAULT_REGION)

# === FILE NAMES (GD & CC) ===
CSV_OBJECT_KEY = 'ct-peerfinder.csv' 
FEEDBACK_OBJECT_KEY = 'ct-peerfinder-feedback.csv'
SESSION_FEEDBACK_OBJECT_KEY = 'ct_peer_session_feedback.csv'
NO_SHOW_OBJECT_KEY = 'ct_no_show_analysis.csv'
UNPAIR_REASONS_KEY = 'ct_unpair_reason_data.csv'

# FALLBACK ADDED: If they forget the Render Env Var, 'admin123' will always work!
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# === PROGRAM CREDENTIALS ===
def load_google_token(env_var_name):
    token_str = os.environ.get(env_var_name)
    if not token_str:
        logger.error(f"Missing environment variable: {env_var_name}")
        return None
    try:
        return json.loads(token_str)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON for {env_var_name}: {e}")
        return None

PROGRAM_CREDENTIALS = {
    'CC': {
        'email': os.environ.get('CC_EMAIL', 'contentcreation@alxafrica.com'),
        'token': load_google_token('CC_GOOGLE_TOKEN')
    },
    'GD': {
        'email': os.environ.get('GD_EMAIL', 'graphicdesign@alxafrica.com'),
        'token': load_google_token('GD_GOOGLE_TOKEN')
    }
}

SCOPES = ['https://www.googleapis.com/auth/gmail.send']

def validate_registration(data):
    errors = []
    if not data.get('name') or len(data['name'].strip()) < 2 or len(data['name']) > 100:
        errors.append("Name must be between 2 and 100 characters")
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', data.get('email', '')):
        errors.append("Invalid email address format")
    if not re.match(r'^\+?[1-9]\d{1,14}$', data.get('phone', '').replace(' ', '')):
        errors.append("Invalid phone number")
    if data.get('program') not in ['VA', 'AiCE', 'PF', 'CC', 'GD']:
        errors.append("Invalid program selected. Please choose Content Creation (CC) or Graphic Design (GD).")
    if data.get('connection_type') not in ['find', 'offer', 'need', 'group']:
        errors.append("Invalid connection type")
    if data.get('connection_type') == 'offer' and not data.get('pseudonym'):
        errors.append("A pseudonym is required for volunteers")
    return errors

def api_wrapper(f):
    def wrapper(*args, **kwargs):
        try: return f(*args, **kwargs)
        except ClientError: return jsonify({"success": False, "error": "Database connection failed (S3)"}), 503
        except pd.errors.EmptyDataError: return jsonify({"success": False, "error": "Data file is empty or corrupted"}), 500
        except Exception as e: return jsonify({"success": False, "error": f"Server Error: {str(e)}"}), 500
    wrapper.__name__ = f.__name__
    return wrapper

def get_gmail_service(program_name):
    if not program_name or program_name not in PROGRAM_CREDENTIALS: program_name = 'CC'
    config = PROGRAM_CREDENTIALS[program_name]
    try:
        creds = Credentials.from_authorized_user_info(config['token'], SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token: creds.refresh(Request())
        return build('gmail', 'v1', credentials=creds), config['email']
    except Exception: return None, None

def send_email(to, subject, body, program_name, is_html=True):
    try:
        service, sender_email = get_gmail_service(program_name)
        if not service: return False
        message = MIMEMultipart('alternative')
        message['to'] = to
        message['from'] = sender_email
        message['subject'] = subject

        html_body = f"""
        <html><body style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
        <div style="background-color: #091F40; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ALX Creative Tech PeerFinder ({program_name})</h1>
        </div>
        <div style="padding: 30px; color: #333333; font-size: 16px; line-height: 1.6;">{body}</div>
        </div></body></html>"""
        
        if is_html: message.attach(MIMEText(html_body, 'html'))
        else: message.attach(MIMEText(body, 'plain'))
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId='me', body={'raw': raw}).execute()
        return True
    except Exception: return False

def notify_group_match(df, group_id):
    grp = df[df['group_id'] == group_id]
    video_link = f"https://meet.jit.si/ALX-CT-PeerFinder-{group_id}"

    for _, current_user in grp.iterrows():
        peer_info_html = ""
        for _, peer in grp.iterrows():
            if peer['id'] != current_user['id']:
                clean_phone = re.sub(r'\D', '', str(peer['phone']))
                wa_link = f"https://wa.me/{clean_phone}"
                telegram_link = f"https://t.me/+{clean_phone}"
                meet_pref = str(peer.get('meeting_preference', 'All'))
                role_label = "Volunteer" if peer['connection_type'] == 'offer' else "Peer" if peer['connection_type'] == 'need' else "Study Buddy"
                display_name = peer['pseudonym'] if str(peer.get('pseudonym')) else peer['name']

                peer_info_html += f"""
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e0e0e0;">
                <strong style="font-size: 18px; color: #091F40;">{display_name}</strong><br/>
                <span style="color: #555;"> 📧  {peer['email']}</span><br/>
                <span style="color: #555;"> 🎯  Role: <strong>{role_label}</strong></span><br/>
                <span style="color: #555;"> 📌  Prefers to meet via: <strong>{meet_pref}</strong></span><br/>
                <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="{wa_link}" style="background-color: #25D366; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">WhatsApp</a>
                <a href="{telegram_link}" style="background-color: #0088cc; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">Telegram</a>
                </div>
                </div>"""

        is_volunteer = current_user['connection_type'] == 'offer'
        is_needer = current_user['connection_type'] == 'need'

        if is_volunteer:
            cap = int(float(current_user.get('volunteer_capacity', 3))) if pd.notna(current_user.get('volunteer_capacity')) and str(current_user.get('volunteer_capacity')) not in ['', 'None'] else 3
            current_needers = len(grp[grp['connection_type'] == 'need'])
            remaining = cap - current_needers
            custom_msg = f"Thanks so much, <strong>{current_user['name']}</strong>, for stepping up to support your peers in need. You are a true champion and we will not forget you for this!<br/><br/>"
            if remaining > 0:
                custom_msg += f"You requested to support {cap} peers, and you have currently been matched with {current_needers}. Over time, {remaining} more peer(s) will be added to your group as they register and search for help."
            else:
                custom_msg += f"Your group is now fully matched with all {cap} peers you requested to support!"
        elif is_needer:
            custom_msg = f"Hi <strong>{current_user['name']}</strong>,<br/><br/>Great news! You have been successfully paired with a Volunteer who is ready to support you (and potentially other peers)."
        else:
            custom_msg = f"Hi <strong>{current_user['name']}</strong>,<br/><br/>You have been successfully matched! Here is the information for your peer(s):"

        body = f"""
        <h2 style="color: #091F40; margin-top: 0;">It's a Match!  🎉 </h2>
        {custom_msg}<br/><br/>
        {peer_info_html}
        <br/>
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border: 1px solid #f32c2c; text-align: center;">
        <h3 style="margin-top: 0; color: #b91c1c;"> 🎥  Your Dedicated Group Video Room</h3>
        <p style="margin-bottom: 10px; color: #7f1d1d;">We have generated a free, instant video meeting room for your group. No account required!</p>
        <a href="{video_link}" style="background-color: #f32c2c; color: white; padding: 12px 25px; text-decoration: none; border-radius: 30px; font-weight: bold; display: inline-block;">Join Video Call Now</a>
        </div>
        <br/><br/>
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeeba; font-size: 14px;">
        <strong style="color: #856404; font-size: 16px;"> ⚠ ️ Please Read Carefully</strong><br/><br/>
        <ul style="margin-bottom: 0; padding-left: 20px; color: #856404;">
        <li>Please show up for your partner or group — ghosting is discouraged and can affect their progress.</li>
        <li>If you no longer wish to participate, let your partner/group know first before unpairing.</li>
        </ul>
        </div><br/>Best regards,<br/><strong>Creative Tech PeerFinder Team</strong>"""
        try: send_email(current_user['email'], "You've been matched!  🎉 ", body, current_user['program'], is_html=True)
        except Exception: pass

REQUIRED_COLUMNS = [
    'id', 'name', 'phone', 'email', 'country', 'language', 'program', 'course', 'learning_preferences', 'availability',
    'match_preference', 'connection_type', 'timestamp', 'matched', 'group_id', 'unpair_reason', 'matched_timestamp',
    'match_attempted', 'volunteer_capacity', 'meeting_preference', 'timezone', 'group_size', 'pseudonym', 'current_load'
]

def clean_boolean(val):
    if pd.isna(val): return False
    return str(val).strip().upper() in ['TRUE', '1', 'YES', 'T']

def download_csv(key=CSV_OBJECT_KEY):
    try:
        obj = s3.get_object(Bucket=AWS_S3_BUCKET, Key=key)
        df = pd.read_csv(io.StringIO(obj['Body'].read().decode('utf-8')))
        if key == CSV_OBJECT_KEY:
            for col in REQUIRED_COLUMNS:
                if col not in df.columns:
                    df[col] = False if col in ['matched', 'match_attempted'] else 0 if col == 'current_load' else ''

            str_cols = ['id', 'name', 'phone', 'email', 'country', 'program', 'course', 'availability', 'connection_type', 'group_id', 'match_preference', 'learning_preferences', 'unpair_reason', 'timestamp', 'matched_timestamp', 'timezone', 'meeting_preference', 'volunteer_capacity', 'group_size', 'pseudonym']
            for c in str_cols:
                if c in df.columns: df[c] = df[c].astype(str).str.replace(r'\.0$', '', regex=True).str.replace(r'\s+', ' ', regex=True).str.strip().replace('nan', '')

            if 'matched' in df.columns: df['matched'] = df['matched'].apply(clean_boolean)
            if 'match_attempted' in df.columns: df['match_attempted'] = df['match_attempted'].apply(clean_boolean)
            if 'email' in df.columns: df['email'] = df['email'].str.lower()
        return df
    except ClientError:
        if key == CSV_OBJECT_KEY: return pd.DataFrame(columns=REQUIRED_COLUMNS)
        elif key == FEEDBACK_OBJECT_KEY: return pd.DataFrame(columns=['id', 'rating', 'comment', 'timestamp'])
        elif key == SESSION_FEEDBACK_OBJECT_KEY: return pd.DataFrame(columns=['id', 'timestamp', 'email', 'program', 'course', 'role', 'volunteer_email', 'session_happened', 'ghoster_emails', 'rematch_request', 'overall_rating', 'progress', 'feedback_details'])
        elif key == UNPAIR_REASONS_KEY: return pd.DataFrame(columns=['timestamp', 'user_id', 'email', 'program', 'course', 'reason', 'ghoster_email'])
        elif key == NO_SHOW_OBJECT_KEY: return pd.DataFrame(columns=['timestamp', 'reporter', 'ghoster'])
        return pd.DataFrame()

def upload_csv(df, key=CSV_OBJECT_KEY):
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    s3.put_object(Bucket=AWS_S3_BUCKET, Key=key, Body=csv_buffer.getvalue(), ContentType='text/csv')

def normalize_str(val):
    if pd.isna(val) or val is None: return ""
    return re.sub(r'\s+', ' ', str(val)).strip().lower()

def parse_tz_offset(tz_str):
    if not tz_str or pd.isna(tz_str): return 0
    tz_str = str(tz_str).upper()
    if 'WAT' in tz_str: return 1
    if 'CAT' in tz_str: return 2
    if 'EAT' in tz_str: return 3
    if 'GMT' in tz_str and '+' not in tz_str and '-' not in tz_str: return 0
    match = re.search(r'UTC([+-]\d+)', tz_str)
    if match: return int(match.group(1))
    return 0

def get_course_num(course_str):
    try:
        match = re.search(r'-(\d+)', str(course_str))
        return int(match.group(1)) if match else 0
    except: return 0

# === THE SMART MATCHING ENGINE ===
def perform_matching(df, user_id):
    user_rows = df[df['id'] == user_id]
    if user_rows.empty: return df, False, None
    idx = user_rows.index[0]
    user = user_rows.iloc[0]
    df.at[idx, 'match_attempted'] = True
    if bool(user['matched']): return df, False, None

    updated = False
    gid = f"group-{uuid.uuid4()}"
    iso = datetime.now(timezone.utc).isoformat()
    u_program = normalize_str(user['program'])
    u_course = normalize_str(user['course'])
    u_country = normalize_str(user['country'])

    program_pool = df[(df['matched'] == False) & (df['program'].apply(normalize_str) == u_program) & (df['course'].apply(normalize_str) == u_course) & (df['id'] != user_id)]

    if user['connection_type'] in ['find', 'group']:
        size = str(user['group_size']).replace('.0', '').strip() if pd.notna(user['group_size']) and user['group_size'] else '2'
        base_pool = program_pool[(program_pool['connection_type'].isin(['find', 'group'])) & (program_pool['group_size'].astype(str).str.replace('.0', '', regex=False).str.strip() == size)].copy()
        needed = int(size) - 1
        if len(base_pool) >= needed:
            u_tz = parse_tz_offset(user['timezone'])
            best_match_indices = []
            for pool_idx, p_user in base_pool.iterrows():
                p_tz = parse_tz_offset(p_user['timezone'])
                tz_diff = abs(u_tz - p_tz)
                if user['country'] == p_user['country'] and user['match_preference'] in ['Country', 'Timezone']:
                    best_match_indices.append(pool_idx)
                elif u_tz == p_tz and user['match_preference'] in ['Timezone', 'Buffer']:
                    best_match_indices.append(pool_idx)
                elif tz_diff <= 2 and user['match_preference'] == 'Buffer':
                    best_match_indices.append(pool_idx)
                elif user['match_preference'] == 'Global' and p_user['match_preference'] == 'Global':
                    best_match_indices.append(pool_idx)
                if len(best_match_indices) == needed: break

            if len(best_match_indices) == needed:
                all_idx = [idx] + best_match_indices
                df.loc[all_idx, 'matched'] = True
                df.loc[all_idx, 'group_id'] = gid
                df.loc[all_idx, 'matched_timestamp'] = iso
                df.loc[all_idx, 'unpair_reason'] = ''
                updated = True

    elif user['connection_type'] == 'offer':
        capacity = int(float(user.get('volunteer_capacity', 3))) if pd.notna(user.get('volunteer_capacity')) and str(user.get('volunteer_capacity')) not in ['', 'None'] else 3
        pool = program_pool[(program_pool['connection_type'] == 'need')].copy()
        if not pool.empty:
            matched_peers = pool.head(capacity)
            all_idx = [idx] + matched_peers.index.tolist()
            df.loc[all_idx, 'matched'] = True
            df.loc[all_idx, 'group_id'] = gid
            df.loc[all_idx, 'matched_timestamp'] = iso
            df.loc[all_idx, 'unpair_reason'] = ''
            df.at[idx, 'current_load'] = len(matched_peers)
            updated = True

    elif user['connection_type'] == 'need':
        course_num = get_course_num(user['course'])
        active_vols = df[(df['connection_type'] == 'offer') & (df['program'].apply(normalize_str) == u_program) & (df['matched'] == True)]
        joined_existing = False
        
        for v_idx, vol in active_vols.iterrows():
            v_cap = int(float(vol.get('volunteer_capacity', 3))) if pd.notna(vol.get('volunteer_capacity')) and str(vol.get('volunteer_capacity')) not in ['', 'None'] else 3
            v_group_id = vol['group_id']
            if not v_group_id: continue
            
            current_needers = len(df[(df['group_id'] == v_group_id) & (df['connection_type'] == 'need')])
            if current_needers < v_cap:
                df.at[idx, 'matched'] = True
                df.at[idx, 'group_id'] = v_group_id
                df.at[idx, 'matched_timestamp'] = iso
                df.at[idx, 'unpair_reason'] = ''
                df.at[v_idx, 'current_load'] = current_needers + 1
                updated = True
                gid = v_group_id
                joined_existing = True
                break
                
        if not joined_existing:
            unmatched_vols = program_pool[(program_pool['connection_type'] == 'offer')].copy()
            if not unmatched_vols.empty:
                vol = unmatched_vols.iloc[0]
                v_idx = unmatched_vols.index[0]
                v_cap = int(float(vol.get('volunteer_capacity', 3))) if pd.notna(vol.get('volunteer_capacity')) and str(vol.get('volunteer_capacity')) not in ['', 'None'] else 3
                
                other_needers = program_pool[(program_pool['connection_type'] == 'need') & (program_pool['id'] != user_id)].copy()
                matched_other_needers = other_needers.head(v_cap - 1)
                all_idx = [idx, v_idx] + matched_other_needers.index.tolist()
                
                df.loc[all_idx, 'matched'] = True
                df.loc[all_idx, 'group_id'] = gid
                df.loc[all_idx, 'matched_timestamp'] = iso
                df.loc[all_idx, 'unpair_reason'] = ''
                df.at[v_idx, 'current_load'] = len(matched_other_needers) + 1
                updated = True

    return df, updated, gid

# === ROUTES ===
@app.route('/', methods=['GET'])
@api_wrapper
def health():
    return jsonify({"status": "active", "vertical": "Creative Tech", "version": "1.0"})

@app.route('/api/register', methods=['POST'])
@api_wrapper
def register():
    data = request.get_json()
    errors = validate_registration(data)
    if errors: return jsonify({"success": False, "error": "; ".join(errors)}), 400
    
    email = data['email'].strip().lower()
    phone = data['phone'].strip()
    if not phone.startswith('+'): phone = '+' + phone.lstrip('+')
    
    df = download_csv()
    existing = df[(df['email'] == email) & (df['program'] == data['program']) & (df['course'] == data['course'])]
    if not existing.empty:
        return jsonify({"success": True, "message": "Already registered for this course.", "is_duplicate": True})

    new_id = str(uuid.uuid4())
    new_row = {
        'id': new_id,
        'name': data['name'].strip(),
        'phone': phone,
        'email': email,
        'country': data['country'].strip(),
        'language': data.get('language', '').strip(),
        'program': data['program'].strip(),
        'course': data['course'].strip(),
        'learning_preferences': data.get('learning_preferences', '').strip(),
        'availability': data.get('availability', '').strip(),
        'match_preference': data.get('match_preference', '').strip(),
        'connection_type': data.get('connection_type', 'find').strip(),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'matched': False,
        'group_id': '',
        'unpair_reason': '',
        'matched_timestamp': '',
        'match_attempted': False,
        'volunteer_capacity': data.get('volunteer_capacity', ''),
        'meeting_preference': data.get('meeting_preference', 'All'),
        'timezone': data.get('timezone', ''),
        'group_size': data.get('group_size', '2'),
        'pseudonym': data.get('pseudonym', ''),
        'current_load': 0
    }
    
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    df, matched, group_id = perform_matching(df, new_id)
    upload_csv(df)
    if matched: notify_group_match(df, group_id)
    return jsonify({"success": True, "message": "Registration successful!", "is_duplicate": False})

@app.route('/api/marketplace', methods=['GET'])
@api_wrapper
def get_marketplace():
    program = request.args.get('program')
    course = request.args.get('course')
    if not program or not course: return jsonify({"success": False, "error": "Program and course required"}), 400
    df = download_csv()
    vols = df[(df['connection_type'] == 'offer') & (df['program'] == program) & (df['course'] == course)]
    volunteers = []
    for _, vol in vols.iterrows():
        volunteers.append({
            'id': vol['id'],
            'name': vol.get('pseudonym', vol['name']),
            'course': vol['course'],
            'country': vol['country'],
            'timezone': vol['timezone'],
            'capacity': vol.get('volunteer_capacity', 3),
            'current_load': vol.get('current_load', 0)
        })
    return jsonify({"success": True, "volunteers": volunteers})

@app.route('/api/status/<email>', methods=['GET'])
@api_wrapper
def get_status(email):
    df = download_csv()
    user_records = df[df['email'] == email.strip().lower()]
    if user_records.empty: return jsonify([])
    
    results = []
    for _, user in user_records.iterrows():
        group_data = []
        if user['matched'] and user['group_id']:
            grp = df[df['group_id'] == user['group_id']]
            for _, p in grp.iterrows():
                group_data.append({
                    'name': p['pseudonym'] if p['connection_type'] == 'offer' else p['name'],
                    'email': p['email'],
                    'phone': p['phone'],
                    'connection_type': p['connection_type'],
                    'meeting_preference': p['meeting_preference'],
                    'timezone': p['timezone']
                })
        results.append({
            'real_id': user['id'],
            'matched': bool(user['matched']),
            'group': group_data,
            'user': {
                'name': user['name'],
                'program': user['program'],
                'course': user['course'],
                'connection_type': user['connection_type'],
                'volunteer_capacity': user.get('volunteer_capacity', '')
            }
        })
    return jsonify(results)

@app.route('/api/leave-group', methods=['POST'])
@api_wrapper
def leave_group():
    data = request.get_json()
    user_id = data.get('user_id')
    reason = data.get('reason', 'User requested unpair')
    ghoster_email = data.get('ghoster_email')
    delete_profile = data.get('delete_profile', False)
    
    df = download_csv()
    if user_id not in df['id'].values: return jsonify({"success": False, "error": "User not found"}), 404
        
    user = df[df['id'] == user_id].iloc[0]
    group_id = user['group_id']
    
    if group_id:
        grp = df[df['group_id'] == group_id]
        df.loc[df['group_id'] == group_id, ['matched', 'group_id', 'matched_timestamp']] = [False, '', '']
        df.loc[df['group_id'] == group_id, 'current_load'] = 0
        for _, member in grp.iterrows():
            body = f"Hi {member['name']},<br/><br/>Your group for {member['course']} was dissolved because a member left. We have placed you back in the queue."
            try: send_email(member['email'], "Group Dissolved - Back in Queue", body, member['program'])
            except Exception: pass
            
    if delete_profile: df = df[df['id'] != user_id]
    else: df.loc[df['id'] == user_id, 'unpair_reason'] = reason
        
    if ghoster_email:
        no_show_df = download_csv(NO_SHOW_OBJECT_KEY)
        new_no_show = pd.DataFrame([{'timestamp': datetime.now(timezone.utc).isoformat(), 'reporter': user['email'], 'ghoster': ghoster_email}])
        no_show_df = pd.concat([no_show_df, new_no_show], ignore_index=True)
        upload_csv(no_show_df, NO_SHOW_OBJECT_KEY)
        
    upload_csv(df)
    return jsonify({"success": True, "message": "Successfully left group"})

@app.route('/api/peer-feedback', methods=['POST'])
@api_wrapper
def submit_session_feedback():
    data = request.get_json()
    new_fb = pd.DataFrame([{
        'id': str(uuid.uuid4()), 'timestamp': datetime.now(timezone.utc).isoformat(),
        'email': data.get('email', ''), 'program': data.get('program', ''), 'course': data.get('course', ''),
        'role': data.get('role', ''), 'volunteer_email': data.get('volunteer_email', ''), 'session_happened': data.get('session_happened', ''),
        'ghoster_emails': data.get('ghoster_emails', ''), 'rematch_request': data.get('rematch_request', ''), 'overall_rating': data.get('overall_rating', ''),
        'progress': data.get('progress', ''), 'feedback_details': data.get('feedback_details', '')
    }])
    fb_df = download_csv(SESSION_FEEDBACK_OBJECT_KEY)
    fb_df = pd.concat([fb_df, new_fb], ignore_index=True)
    upload_csv(fb_df, SESSION_FEEDBACK_OBJECT_KEY)
    return jsonify({"success": True})

# --- ADMIN ROUTES ---
@app.route('/api/admin/data', methods=['POST'])
@api_wrapper
def admin_data():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    df = download_csv()
    return jsonify({
        "success": True, "learners": df.to_dict(orient='records'),
        "stats": { "total_users": len(df), "active_pairs": len(df[df['matched'] == True]), "pending_requests": len(df[df['matched'] == False]), "tool_rating": "4.5" }
    })

@app.route('/api/admin/download', methods=['POST'])
@api_wrapper
def admin_dl():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    return Response(download_csv().to_csv(index=False), mimetype='text/csv')

@app.route('/api/admin/download-feedback', methods=['POST'])
@api_wrapper
def dl_feedback():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    return Response(download_csv(FEEDBACK_OBJECT_KEY).to_csv(index=False), mimetype='text/csv')

@app.route('/api/admin/download-session-feedback', methods=['POST'])
@api_wrapper
def dl_session_feedback():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    return Response(download_csv(SESSION_FEEDBACK_OBJECT_KEY).to_csv(index=False), mimetype='text/csv')

@app.route('/api/admin/download-unpair-reasons', methods=['POST'])
@api_wrapper
def download_unpair_reasons():
    if request.json.get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    return Response(download_csv(UNPAIR_REASONS_KEY).to_csv(index=False), mimetype='text/csv')

@app.route('/api/admin/nudge-feedback', methods=['POST'])
@api_wrapper
def nudge_feedback():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    return jsonify({'success': True, 'message': 'Nudges sent successfully.'})

@app.route('/api/admin/auto-match-queue', methods=['POST'])
@api_wrapper
def auto_match_queue():
    if request.get_json().get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    df = download_csv()
    unmatched = df[df['matched'] == False]
    match_count = 0
    for _, user in unmatched.iterrows():
        df, matched, gid = perform_matching(df, user['id'])
        if matched:
            notify_group_match(df, gid)
            match_count += 1
    upload_csv(df)
    return jsonify({'success': True, 'message': f'Auto-matched {match_count} learners.'})

@app.route('/api/admin/random-pair', methods=['POST'])
@api_wrapper
def admin_random_pair():
    data = request.get_json()
    if data.get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    df = download_csv()
    df, matched, gid = perform_matching(df, data.get('user_id'))
    if matched: notify_group_match(df, gid)
    upload_csv(df)
    return jsonify({'success': True, 'message': 'Random pairing attempted.'})

@app.route('/api/admin/manual-pair', methods=['POST'])
@api_wrapper
def admin_manual_pair():
    data = request.get_json()
    if data.get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    user_ids = data.get('user_ids', [])
    if len(user_ids) < 2: return jsonify({"error": "Need at least 2 users"}), 400
    df = download_csv()
    gid = f"group-{uuid.uuid4()}"
    iso = datetime.now(timezone.utc).isoformat()
    df.loc[df['id'].isin(user_ids), ['matched', 'group_id', 'matched_timestamp', 'unpair_reason']] = [True, gid, iso, '']
    notify_group_match(df, gid)
    upload_csv(df)
    return jsonify({'success': True, 'message': 'Users manually paired.'})

@app.route('/api/unpair/<user_id>', methods=['POST'])
@api_wrapper
def admin_unpair_group(user_id):
    df = download_csv()
    if user_id not in df['id'].values: return jsonify({"error": "User not found"}), 404
    group_id = df[df['id'] == user_id].iloc[0]['group_id']
    if group_id:
        df.loc[df['group_id'] == group_id, ['matched', 'group_id', 'matched_timestamp']] = [False, '', '']
        df.loc[df['group_id'] == group_id, 'current_load'] = 0
        upload_csv(df)
    return jsonify({'success': True, 'message': 'Group unpaired.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
