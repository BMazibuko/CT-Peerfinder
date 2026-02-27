import os
import uuid
import io
import json
import re
from datetime import datetime, timezone
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

# === KEYS ===
SECRET_KEY = os.environ.get('SECRET_KEY', "e8f3473b716cfe3760fd522e38a3bd5b9909510b0ef003f050e0a445fa3a6e83")
app.secret_key = SECRET_KEY

AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_DEFAULT_REGION = os.environ.get('AWS_DEFAULT_REGION')
AWS_S3_BUCKET = os.environ.get('AWS_S3_BUCKET', 'alx-peerfinder-storage-bucket')

s3 = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION
)

# === FILE NAMES ===
CSV_OBJECT_KEY = 'peer_matching_data_v2.csv' 
FEEDBACK_OBJECT_KEY = 'peer_finder_feedback.csv'
SESSION_FEEDBACK_OBJECT_KEY = 'peer_session_feedback.csv'
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')

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
    'VA': {
        'email': os.environ.get('VA_EMAIL', 'vaprogram@alxafrica.com'),
        'token': load_google_token('VA_GOOGLE_TOKEN')
    },
    'AiCE': {
        'email': os.environ.get('AICE_EMAIL', 'aice@alxafrica.com'),
        'token': load_google_token('AICE_GOOGLE_TOKEN')
    },
    'PF': {
        'email': os.environ.get('PF_EMAIL', 'alxfoundations@alxafrica.com'),
        'token': load_google_token('PF_GOOGLE_TOKEN')
    }
}

SCOPES = ['https://www.googleapis.com/auth/gmail.send']

# === 1. INPUT VALIDATION ===
def validate_registration(data):
    errors = []
    if not data.get('name') or len(data['name'].strip()) < 2 or len(data['name']) > 100:
        errors.append("Name must be between 2 and 100 characters")
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', data.get('email', '')):
        errors.append("Invalid email address format")
    if not re.match(r'^\+?[1-9]\d{1,14}$', data.get('phone', '').replace(' ', '')):
        errors.append("Invalid phone number. Use format +1234567890")
    if data.get('program') not in ['VA', 'AiCE', 'PF']:
        errors.append("Invalid program selected")
    if data.get('connection_type') not in ['find', 'offer', 'need']:
        errors.append("Invalid connection type")
    return errors

# === 2. ERROR HANDLING WRAPPER ===
def api_wrapper(f):
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ClientError as e:
            logger.error(f"AWS S3 Error: {e}")
            return jsonify({"success": False, "error": "Database connection failed (S3)"}), 503
        except pd.errors.EmptyDataError:
            logger.error("Pandas Empty Data Error")
            return jsonify({"success": False, "error": "Data file is empty or corrupted"}), 500
        except Exception as e:
            logger.error(f"Unexpected Error in {f.__name__}: {e}")
            return jsonify({"success": False, "error": f"Server Error: {str(e)}"}), 500
    wrapper.__name__ = f.__name__
    return wrapper

# === GMAIL FUNCTIONS ===
def get_gmail_service(program_name):
    if not program_name or program_name not in PROGRAM_CREDENTIALS:
        program_name = 'PF' 
    config = PROGRAM_CREDENTIALS[program_name]
    try:
        creds = Credentials.from_authorized_user_info(config['token'], SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
        return build('gmail', 'v1', credentials=creds), config['email']
    except Exception as e:
        logger.error(f"Auth Error for {program_name}: {e}")
        return None, None

def send_email(to, subject, body, program_name, is_html=True):
    try:
        service, sender_email = get_gmail_service(program_name)
        if not service: return False
        
        message = MIMEMultipart('alternative')
        message['to'] = to
        message['from'] = sender_email
        message['subject'] = subject
        
        # Wrapped in a nice HTML structure
        html_body = f"""
        <html><body style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <div style="background-color: #091F40; padding: 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ALX PeerFinder ({program_name})</h1>
            </div>
            <div style="padding: 30px; color: #333333; font-size: 16px; line-height: 1.6;">
                {body}
            </div>
        </div></body></html>"""

        if is_html: message.attach(MIMEText(html_body, 'html'))
        else: message.attach(MIMEText(body, 'plain'))

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId='me', body={'raw': raw}).execute()
        return True
    except Exception as e:
        logger.error(f"Email Error: {str(e)}")
        return False

# NEW: Helper function to generate and send group match emails with WhatsApp links
def notify_group_match(df, group_id):
    grp = df[df['group_id'] == group_id]
    
    for _, current_user in grp.iterrows():
        peer_info_html = ""
        
        for _, peer in grp.iterrows():
            if peer['id'] != current_user['id']:
                # Clean phone number for WhatsApp link (remove spaces, +, and dashes)
                clean_phone = re.sub(r'\D', '', str(peer['phone']))
                wa_link = f"https://wa.me/{clean_phone}"
                
                support = str(peer.get('kind_of_support', '')).strip()
                if not support or support.lower() == 'nan': 
                    support = "Study Buddy / Accountability"
                    
                peer_info_html += f"""
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e0e0e0;">
                    <strong style="font-size: 18px; color: #091F40;">{peer['name']}</strong><br/>
                    <span style="color: #555;">📧 {peer['email']}</span><br/>
                    <span style="color: #555;">🎯 Role: {support}</span><br/>
                    <div style="margin-top: 15px;">
                        <a href="{wa_link}" style="background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">💬 Message on WhatsApp</a>
                    </div>
                </div>
                """
        
        body = f"""
        <h2 style="color: #091F40; margin-top: 0;">It's a Match! 🎉</h2>
        Hi <strong>{current_user['name']}</strong>,<br/><br/>
        You have been successfully matched! Here is the information for your peer(s):<br/><br/>
        {peer_info_html}
        <br/>
        Kindly reach out to your peer(s) to introduce yourself, collaborate, and offer support!👍<br/><br/>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeeba; font-size: 14px;">
            <strong style="color: #856404; font-size: 16px;">⚠️ Please Read Carefully</strong><br/><br/>
            We want this to be a positive and supportive experience for everyone. To help make that happen:<br/>
            <ul style="margin-bottom: 0; padding-left: 20px; color: #856404;">
                <li>Please show up for your partner or group — ghosting is discouraged and can affect their progress.</li>
                <li>Only fill this form with accurate details. If you've entered incorrect information, kindly unpair yourself.</li>
                <li>If you've completed all your modules, consider supporting others who are catching up — your help can make a real difference.🤗</li>
                <li>If you no longer wish to participate, let your partner/group know first before unpairing.</li>
                <li>If you'd like to be paired with someone new, you'll need to register again.</li>
            </ul>
        </div>
        <br/>
        Thank you for helping create a respectful and encouraging learning community.<br/><br/>
        Best regards,<br/>
        <strong>Peer Finder Team</strong>
        """
        try:
            send_email(current_user['email'], "You've been matched! 🎉", body, current_user['program'], is_html=True)
        except Exception as e:
            logger.error(f"Failed to send match email to {current_user['email']}: {e}")

# === DATA HANDLING ===
REQUIRED_COLUMNS = [
    'id', 'name', 'phone', 'email', 'country', 'language', 'program', 'cohort', 
    'topic_module', 'learning_preferences', 'availability', 
    'preferred_study_setup', 'kind_of_support', 'connection_type',
    'open_to_global_pairing', 'timestamp', 'matched', 'group_id', 
    'unpair_reason', 'matched_timestamp', 'match_attempted'
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
                    df[col] = False if col in ['matched', 'match_attempted'] else ''
            
            str_cols = ['id', 'name', 'phone', 'email', 'country', 'program', 'cohort', 
                       'topic_module', 'availability', 'connection_type', 'group_id', 
                       'open_to_global_pairing', 'preferred_study_setup', 'kind_of_support', 
                       'learning_preferences', 'unpair_reason']
            
            for c in str_cols: 
                if c in df.columns: df[c] = df[c].astype(str).str.strip().replace('nan', '')
            
            if 'matched' in df.columns: df['matched'] = df['matched'].apply(clean_boolean)
            if 'email' in df.columns: df['email'] = df['email'].str.lower()
            
        return df
    except ClientError:
        return pd.DataFrame(columns=REQUIRED_COLUMNS if key == CSV_OBJECT_KEY else ['id', 'rating', 'comment', 'timestamp'])

def upload_csv(df, key=CSV_OBJECT_KEY):
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    s3.put_object(Bucket=AWS_S3_BUCKET, Key=key, Body=csv_buffer.getvalue(), ContentType='text/csv')

def availability_match(a1, a2):
    return (a1 == 'Flexible' or a2 == 'Flexible' or a1 == a2) if (pd.notna(a1) and pd.notna(a2)) else False

# === ROUTES ===

@app.route('/', methods=['GET'])
@api_wrapper
def health():
    return jsonify({"status": "active", "version": "6.0-Validated"})

@app.route('/api/register', methods=['POST'])
@api_wrapper
def register():
    data = request.get_json()
    
    errors = validate_registration(data)
    if errors:
        return jsonify({"success": False, "error": "; ".join(errors)}), 400
    
    email = data['email'].strip().lower()
    phone = data['phone'].strip()
    if not phone.startswith('+'): phone = '+' + phone.lstrip('+')

    df = download_csv()
    
    existing_mask = (df['email'] == email) | (df['phone'] == phone)
    if not df[existing_mask].empty:
        idx = df[existing_mask].index[0]
        existing = df.loc[idx]
        
        if bool(existing['matched']):
            return jsonify({
                "success": False, 
                "is_duplicate": True, 
                "user_id": str(existing['id']), 
                "already_matched": True
            })
        else:
            df.at[idx, 'name'] = data['name']
            df.at[idx, 'program'] = data['program']
            df.at[idx, 'cohort'] = data['cohort']
            df.at[idx, 'country'] = data.get('country', '')
            df.at[idx, 'language'] = data.get('language', '')
            df.at[idx, 'topic_module'] = data.get('topic_module', '')
            df.at[idx, 'learning_preferences'] = data.get('learning_preferences', '')
            df.at[idx, 'availability'] = data.get('availability', '')
            df.at[idx, 'preferred_study_setup'] = data.get('preferred_study_setup', '')
            df.at[idx, 'kind_of_support'] = data.get('kind_of_support', '')
            df.at[idx, 'connection_type'] = data['connection_type']
            df.at[idx, 'open_to_global_pairing'] = data.get('open_to_global_pairing', 'No')
            df.at[idx, 'match_attempted'] = False 
            upload_csv(df)
            return jsonify({"success": True, "user_id": str(existing['id'])})

    new_id = str(uuid.uuid4())
    new_user = {
        'id': new_id, 'name': data['name'], 'email': email, 'phone': phone,
        'program': data['program'], 'cohort': data['cohort'],
        'country': data.get('country', ''), 'language': data.get('language', ''),
        'topic_module': data.get('topic_module', ''),
        'learning_preferences': data.get('learning_preferences', ''),
        'availability': data.get('availability', ''),
        'preferred_study_setup': data.get('preferred_study_setup', ''),
        'kind_of_support': data.get('kind_of_support', ''),
        'connection_type': data['connection_type'],
        'open_to_global_pairing': data.get('open_to_global_pairing', 'No'),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'matched': False, 'group_id': '', 'unpair_reason': '',
        'matched_timestamp': '', 'match_attempted': False
    }
    
    df = pd.concat([df, pd.DataFrame([new_user])], ignore_index=True)
    upload_csv(df)
    
    # NEW FORMATTED WAITING EMAIL
    wait_body = f"""
    <h2 style="color: #091F40; margin-top: 0;">You're in Queue! ⏳</h2>
    Hi <strong>{data['name']}</strong>,<br/><br/>
    Your request is currently in the queue.<br/>
    As soon as a suitable peer or group is available, you'll be matched and notified via email.<br/><br/>
    You can check your status anytime on the PeerFinder app using your Email Address or your Unique ID:<br/>
    <div style="background: #f0f2f5; padding: 15px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 16px; text-align: center; border: 1px dashed #ccc; color: #333;">
        {new_id}
    </div>
    Best regards,<br/>
    <strong>Peer Finder Team</strong>
    """
    send_email(email, "PeerFinder - Waiting to Be Matched ⏳", wait_body, data['program'], is_html=True)
    
    return jsonify({"success": True, "user_id": new_id})

@app.route('/api/status/<identifier>', methods=['GET'])
@api_wrapper
def status(identifier):
    df = download_csv()
    ident_lower = identifier.strip().lower()
    user_rows = df[(df['id'] == identifier.strip()) | (df['email'].str.lower() == ident_lower)]
    
    if user_rows.empty: 
        return jsonify({"error": "Not found"}), 404
        
    u = user_rows.iloc[0]
    res = {
        "matched": bool(u['matched']), 
        "user": {"name": u['name'], "program": u.get('program', ''), "cohort": u['cohort']},
        "real_id": str(u['id'])
    }
    
    if bool(u['matched']) and u['group_id']:
        grp = df[df['group_id'] == u['group_id']]
        res['group'] = grp[['name', 'email', 'phone', 'connection_type']].fillna("").to_dict('records')
        
    return jsonify(res)

@app.route('/api/match', methods=['POST'])
@api_wrapper
def match():
    data = request.json
    user_id = data.get('user_id')
    
    df = download_csv()
    user_rows = df[df['id'] == user_id]
    if user_rows.empty: return jsonify({'error': 'User not found'}), 404
    
    idx = user_rows.index[0]
    user = user_rows.iloc[0]
    df.at[idx, 'match_attempted'] = True
    
    if bool(user['matched']): return jsonify({'matched': True})
    
    updated = False
    gid = f"group-{uuid.uuid4()}"
    iso = datetime.now(timezone.utc).isoformat()
    
    program_pool = df[
        (df['matched'] == False) & 
        (df['program'] == user['program']) & 
        (df['id'] != user_id)
    ]

    if user['connection_type'] == 'find':
        size = str(user['preferred_study_setup']) if user['preferred_study_setup'] else '2'
        base_pool = program_pool[
            (program_pool['connection_type'] == 'find') &
            (program_pool['preferred_study_setup'] == size)
        ]

        if str(user.get('open_to_global_pairing', '')).strip().upper() == 'YES':
            pool = base_pool[
                (base_pool['cohort'] == user['cohort']) &
                ((base_pool['country'] == user['country']) | (base_pool['open_to_global_pairing'].str.strip().str.upper() == 'YES'))
            ].copy()
        else:
            pool = base_pool[
                (base_pool['cohort'] == user['cohort']) &
                (base_pool['country'] == user['country']) &
                (base_pool['topic_module'] == user['topic_module']) & 
                (base_pool['availability'].apply(lambda x: availability_match(str(x), str(user['availability']))))
            ].copy()
        
        if len(pool) >= (int(size) - 1):
            all_idx = [idx] + pool.head(int(size) - 1).index.tolist()
            df.loc[all_idx, 'matched'] = True
            df.loc[all_idx, 'group_id'] = gid
            df.loc[all_idx, 'matched_timestamp'] = iso
            df.loc[all_idx, 'unpair_reason'] = '' 
            updated = True
            
    elif user['connection_type'] in ['offer', 'need']:
        target = 'need' if user['connection_type'] == 'offer' else 'offer'
        base_pool = program_pool[program_pool['connection_type'] == target]
        
        if str(user.get('open_to_global_pairing', '')).strip().upper() == 'YES':
            pool = base_pool[
                (base_pool['cohort'] == user['cohort']) &
                ((base_pool['country'] == user['country']) | (base_pool['open_to_global_pairing'].str.strip().str.upper() == 'YES'))
            ].copy()
        else:
            pool = base_pool[
                (base_pool['cohort'] == user['cohort']) &
                (base_pool['country'] == user['country']) &
                (base_pool['topic_module'] == user['topic_module']) &
                (base_pool['availability'].apply(lambda x: availability_match(str(x), str(user['availability']))))
            ].copy()
        
        if not pool.empty:
            pidx = pool.index[0]
            df.loc[[idx, pidx], 'matched'] = True
            df.loc[[idx, pidx], 'group_id'] = gid
            df.loc[[idx, pidx], 'matched_timestamp'] = iso
            df.loc[[idx, pidx], 'unpair_reason'] = ''
            updated = True

    if updated:
        upload_csv(df)
        notify_group_match(df, gid) # Send new dynamic emails!
        return jsonify({'matched': True, 'group_id': gid})
    
    upload_csv(df)
    return jsonify({'matched': False})


@app.route('/api/leave-group', methods=['POST'])
@api_wrapper
def leave_group(user_id=None):
    data = request.get_json() or {}
    target_id = user_id or data.get('user_id')
    delete_profile = data.get('delete_profile', False) # NEW: Check if they want to be deleted
    
    df = download_csv()
    user_rows = df[df['id'] == target_id]
    if user_rows.empty: return jsonify({"error": "User not found"}), 404
    
    idx = user_rows.index[0]
    old_group_id = df.at[idx, 'group_id'] 
    
    # 1. Unpair the user
    df.at[idx, 'matched'] = False
    df.at[idx, 'group_id'] = ''
    df.at[idx, 'unpair_reason'] = data.get('reason', 'User Requested')
    
    # 2. Ghost Group Logic (Put the remaining partner back in queue)
    if old_group_id:
        remaining_members = df[df['group_id'] == old_group_id]
        if len(remaining_members) == 1:
            rem_idx = remaining_members.index[0]
            df.at[rem_idx, 'matched'] = False
            df.at[rem_idx, 'group_id'] = ''
            
    # 3. NEW: If they chose "Completely delete me", drop their row entirely
    if delete_profile:
        df = df.drop(index=idx)
        
    upload_csv(df)
    return jsonify({"success": True})


@app.route('/api/feedback', methods=['POST'])
@api_wrapper
def submit_feedback():
    data = request.get_json()
    df = download_csv(FEEDBACK_OBJECT_KEY)
    new_row = {'id': str(uuid.uuid4()), 'rating': data.get('rating'), 'comment': data.get('comment', ''), 'timestamp': datetime.now(timezone.utc).isoformat()}
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    upload_csv(df, FEEDBACK_OBJECT_KEY)
    return jsonify({"success": True})

@app.route('/api/admin/data', methods=['POST'])
@api_wrapper
def get_admin_data():
    if request.get_json().get('password') != ADMIN_PASSWORD: 
        return jsonify({"error": "Unauthorized"}), 401
    
    df = download_csv()
    total = len(df)
    matched_count = len(df[df['matched'] == True])
    pending_count = total - matched_count
    match_rate = f"{(matched_count / total * 100):.1f}%" if total > 0 else "0.0%"

    stats = {
        "total": total,
        "matched": matched_count,
        "pending": pending_count,
        "match_rate": match_rate,
        "offer": len(df[df['connection_type'] == 'offer']),
        "need": len(df[df['connection_type'] == 'need'])
    }
    return jsonify({"success": True, "stats": stats, "learners": df.fillna("").to_dict('records')})

@app.route('/api/admin/random-pair', methods=['POST'])
@api_wrapper
def random_pair():
    data = request.get_json()
    if data.get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    
    tid = data.get('user_id')
    df = download_csv()
    t_row = df[df['id'] == tid]
    if t_row.empty: return jsonify({"error": "User not found"}), 404
    if bool(t_row.iloc[0]['matched']): return jsonify({"error": "Already matched"}), 400
    
    user = t_row.iloc[0]
    size = str(user['preferred_study_setup']) if user['preferred_study_setup'] else '2'
    
    pool = df[
        (df['matched'] == False) & 
        (df['id'] != tid) &
        (df['program'] == user['program']) &
        (df['preferred_study_setup'] == size)
    ]
    
    needed = int(size) - 1
    if len(pool) < needed: return jsonify({"success": False, "message": "Not enough learners"}), 200
    
    peers = pool.sample(n=needed)
    gid = f"group-random-{uuid.uuid4()}"
    iso = datetime.now(timezone.utc).isoformat()
    
    idx_list = [t_row.index[0]] + peers.index.tolist()
    df.loc[idx_list, 'matched'] = True
    df.loc[idx_list, 'group_id'] = gid
    df.loc[idx_list, 'matched_timestamp'] = iso
    upload_csv(df)
    
    notify_group_match(df, gid) # Send new dynamic emails
        
    return jsonify({"success": True, "message": "Matched!"})

@app.route('/api/admin/manual-pair', methods=['POST'])
@api_wrapper
def manual_pair():
    data = request.get_json()
    if data.get('password') != ADMIN_PASSWORD: return jsonify({"error": "Unauthorized"}), 401
    
    ids = data.get('user_ids', [])
    if len(ids) < 2: return jsonify({"error": "Select 2+"}), 400
    
    df = download_csv()
    rows = df[df['id'].isin(ids)]
    if len(rows) != len(ids): return jsonify({"error": "Users not found"}), 404
    if rows['matched'].any(): return jsonify({"error": "Already matched"}), 400
    
    gid = f"group-manual-{uuid.uuid4()}"
    iso = datetime.now(timezone.utc).isoformat()
    
    df.loc[rows.index, 'matched'] = True
    df.loc[rows.index, 'group_id'] = gid
    df.loc[rows.index, 'matched_timestamp'] = iso
    upload_csv(df)
    
    notify_group_match(df, gid) # Send new dynamic emails
        
    return jsonify({"success": True, "message": "Paired!"})

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

@app.route('/api/unpair/<user_id>', methods=['POST'])
@api_wrapper
def admin_unpair(user_id):
    return leave_group(user_id=user_id)

@app.route('/api/peer-feedback', methods=['POST'])
@api_wrapper
def submit_peer_session_feedback():
    data = request.get_json()
    df = download_csv(SESSION_FEEDBACK_OBJECT_KEY)
    
    new_row = {
        'id': str(uuid.uuid4()),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'email': data.get('email', ''),
        'program': data.get('program', ''),
        'session_happened': data.get('session_happened', ''),
        'no_session_reason': data.get('no_session_reason', ''),
        'rematch_request': data.get('rematch_request', ''),
        'role': data.get('role', ''),
        'peer_rating': data.get('peer_rating', ''),
        'session_rating': data.get('session_rating', ''),
        'v_preparedness': data.get('v_preparedness', ''),
        'v_issue_discussed': data.get('v_issue_discussed', ''),
        'v_confidence': data.get('v_confidence', ''),
        'v_commit_action': data.get('v_commit_action', ''),
        'v_help_submit': data.get('v_help_submit', ''),
        'v_worked_well': data.get('v_worked_well', ''),
        'v_improve': data.get('v_improve', ''),
        'h_respected': data.get('h_respected', ''),
        'h_clarified': data.get('h_clarified', ''),
        'h_outcome': data.get('h_outcome', ''),
        'h_request_again': data.get('h_request_again', ''),
        'h_most_helpful': data.get('h_most_helpful', ''),
        'h_improve': data.get('h_improve', ''),
        'safeguard_issue': data.get('safeguard_issue', ''),
        'safeguard_details': data.get('safeguard_details', '')
    }
    
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    upload_csv(df, SESSION_FEEDBACK_OBJECT_KEY)
    
    return jsonify({"success": True})

@app.route('/api/admin/download-session-feedback', methods=['POST'])
@api_wrapper
def dl_session_feedback():
    if request.get_json().get('password') != ADMIN_PASSWORD: 
        return jsonify({"error": "Unauthorized"}), 401
    return Response(download_csv(SESSION_FEEDBACK_OBJECT_KEY).to_csv(index=False), mimetype='text/csv')

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')
