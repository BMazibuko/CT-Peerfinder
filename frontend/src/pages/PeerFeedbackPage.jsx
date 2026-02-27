import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { colors, fonts } from '../theme';
import Spinner from '../components/Spinner';
import { API_URL } from '../config';

const PeerFeedbackPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    email: '',
    program: '',
    session_happened: '',
    
    // If No
    no_session_reason: '',
    rematch_request: '',
    
    // If Yes
    role: '',
    peer_rating: 0,
    session_rating: 0,
    
    // Volunteer specific
    v_preparedness: '',
    v_issue_discussed: '',
    v_confidence: '',
    v_commit_action: '',
    v_help_submit: '',
    v_worked_well: '',
    v_improve: '',
    
    // Help Seeker / General specific
    h_respected: '',
    h_clarified: '',
    h_outcome: '',
    h_request_again: '',
    h_most_helpful: '',
    h_improve: '',
    
    // Safeguard (Both Yes paths)
    safeguard_issue: '',
    safeguard_details: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRating = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // We will send this to a new endpoint we can build later
      await axios.post(`${API_URL}/api/peer-feedback`, formData);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      // Fallback success for now so you can test the UI flow before backend is ready
      setSuccess(true); 
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={styles.card}>
          <h1 style={{fontSize: '3rem', marginBottom: '10px'}}>🌟</h1>
          <h2 style={{color: colors.primary.berkeleyBlue}}>Thank You!</h2>
          <p style={{color: '#555', marginBottom: '30px'}}>Your feedback helps us measure impact and spot our amazing community stars.</p>
          <button onClick={() => navigate('/')} style={styles.primaryBtn}>Back to Home</button>
        </motion.div>
      </div>
    );
  }

  const isSessionYes = formData.session_happened === 'Yes, we both showed up';
  const isSessionNo = formData.session_happened && formData.session_happened !== 'Yes, we both showed up';

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={() => navigate('/')}>&larr; Back</button>
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={styles.card}>
        <h2 style={styles.header}>Peer Session Feedback 🌟</h2>
        <p style={styles.subtext}>Help us spotlight our amazing peers and improve the program.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          
          {/* --- BASE INFO --- */}
          <div style={styles.section}>
            <label style={styles.label}>Your Learning Email Address *</label>
            <input style={styles.input} type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="To help us track and spotlight you!" />

            <label style={styles.label}>Your Program *</label>
            <select style={styles.select} name="program" value={formData.program} onChange={handleChange} required>
              <option value="">--Select Program--</option>
              <option value="VA">Virtual Assistant</option>
              <option value="AiCE">AI Career Essentials</option>
              <option value="PF">Professional Foundations</option>
            </select>
          </div>

          {/* --- SECTION 1: ATTENDANCE GATE --- */}
          {formData.email && formData.program && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} style={styles.section}>
              <label style={styles.label}>Did the scheduled peer support session take place? *</label>
              <div style={styles.radioGroup}>
                {['Yes, we both showed up', 'No, I showed up but the other person did not', 'No, I did not show up', 'We rescheduled'].map(opt => (
                  <label key={opt} style={styles.radioLabel}>
                    <input type="radio" name="session_happened" value={opt} checked={formData.session_happened === opt} onChange={handleChange} required /> {opt}
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {/* --- SECTION 2: NO SESSION (SHORT CLOSE-OUT) --- */}
          {isSessionNo && (
            <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} style={styles.section}>
              <div style={styles.alertBox}>Since the session didn't happen, we just need a quick update.</div>
              
              <label style={styles.label}>What happened? *</label>
              <textarea style={styles.textarea} name="no_session_reason" value={formData.no_session_reason} onChange={handleChange} required placeholder="(e.g., scheduling conflict, ghosting, technical problem)" />
              
              <label style={styles.label}>Would you like to be rematched? *</label>
              <select style={styles.select} name="rematch_request" value={formData.rematch_request} onChange={handleChange} required>
                <option value="">--Select--</option><option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </motion.div>
          )}

          {/* --- SECTION 3: FULL FEEDBACK (SESSION HAPPENED) --- */}
          {isSessionYes && (
            <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}}>
              
              {/* RATINGS */}
              <div style={styles.section}>
                <label style={styles.label}>Rate your Peer(s) *</label>
                <p style={styles.hint}>1 = Unhelpful/Inactive, 5 = Amazing/Awesome Support Star!</p>
                <div style={styles.stars}>
                  {[1,2,3,4,5].map(s => (
                    <span key={s} onClick={() => handleRating('peer_rating', s)} style={{...styles.star, color: s <= formData.peer_rating ? '#FFD700' : '#ddd'}}>★</span>
                  ))}
                </div>

                <label style={styles.label}>Rate the Session Overall *</label>
                <p style={styles.hint}>1 = Waste of time, 5 = Highly productive and helpful</p>
                <div style={styles.stars}>
                  {[1,2,3,4,5].map(s => (
                    <span key={s} onClick={() => handleRating('session_rating', s)} style={{...styles.star, color: s <= formData.session_rating ? '#FFD700' : '#ddd'}}>★</span>
                  ))}
                </div>
              </div>

              {/* ROLE SELECTION */}
              <div style={styles.section}>
                <label style={styles.label}>What was your primary role in this session? *</label>
                <select style={styles.select} name="role" value={formData.role} onChange={handleChange} required>
                  <option value="">--Select Role--</option>
                  <option value="Volunteer">I offered support / Volunteered</option>
                  <option value="HelpSeeker">I requested help / Struggling</option>
                  <option value="StudyBuddy">We were just Study Buddies (Equal)</option>
                </select>
              </div>

              {/* VOLUNTEER PATH */}
              {formData.role === 'Volunteer' && (
                <div style={styles.section}>
                  <label style={styles.label}>How prepared did you feel? *</label>
                  <select style={styles.select} name="v_preparedness" onChange={handleChange} required><option value="">--Select--</option><option value="Very prepared">Very prepared</option><option value="Somewhat prepared">Somewhat prepared</option><option value="Not prepared">Not prepared</option></select>

                  <label style={styles.label}>What was the main issue discussed? *</label>
                  <select style={styles.select} name="v_issue_discussed" onChange={handleChange} required><option value="">--Select--</option><option value="Test clarification">Test clarification</option><option value="Milestone guidance">Milestone guidance</option><option value="Time management">Time management</option><option value="Motivation">Motivation</option><option value="Technical issue">Technical issue</option><option value="Other">Other</option></select>

                  <label style={styles.label}>Are you confident the learner understood next steps? *</label>
                  <select style={styles.select} name="v_confidence" onChange={handleChange} required><option value="">--Select--</option><option value="Very confident">Very confident</option><option value="Somewhat confident">Somewhat confident</option><option value="Not confident">Not confident</option></select>
                  
                  <label style={styles.label}>Do you believe this session will help them submit their deliverable? *</label>
                  <select style={styles.select} name="v_help_submit" onChange={handleChange} required><option value="">--Select--</option><option value="Yes">Yes</option><option value="Unsure">Unsure</option><option value="No">No</option></select>
                </div>
              )}

              {/* HELP SEEKER / BUDDY PATH */}
              {(formData.role === 'HelpSeeker' || formData.role === 'StudyBuddy') && (
                <div style={styles.section}>
                  <label style={styles.label}>Did you feel respected and supported? *</label>
                  <select style={styles.select} name="h_respected" onChange={handleChange} required><option value="">--Select--</option><option value="Yes">Yes</option><option value="Somewhat">Somewhat</option><option value="No">No</option></select>

                  <label style={styles.label}>Did this clarify your test/milestone? *</label>
                  <select style={styles.select} name="h_clarified" onChange={handleChange} required><option value="">--Select--</option><option value="Yes">Yes</option><option value="Partially">Partially</option><option value="No">No</option></select>

                  <label style={styles.label}>After this session, did you: *</label>
                  <select style={styles.select} name="h_outcome" onChange={handleChange} required><option value="">--Select--</option><option value="Submit the deliverable">Submit the deliverable</option><option value="Plan to submit within 48 hours">Plan to submit within 48 hours</option><option value="Still unsure">Still unsure</option></select>
                </div>
              )}

              {/* SAFEGUARD (For all YES paths) */}
              {formData.role && (
                <div style={styles.section}>
                  <label style={styles.label}>Did you experience anything inappropriate or concerning? *</label>
                  <select style={styles.select} name="safeguard_issue" value={formData.safeguard_issue} onChange={handleChange} required>
                    <option value="">--Select--</option><option value="No">No</option><option value="Yes">Yes</option>
                  </select>

                  {formData.safeguard_issue === 'Yes' && (
                    <motion.div initial={{opacity:0}} animate={{opacity:1}} style={{marginTop: '10px'}}>
                      <label style={{...styles.label, color: colors.secondary.tomato}}>Please provide brief details so we can assist: *</label>
                      <textarea style={{...styles.textarea, borderColor: colors.secondary.tomato}} name="safeguard_details" value={formData.safeguard_details} onChange={handleChange} required />
                    </motion.div>
                  )}
                </div>
              )}

            </motion.div>
          )}

          {/* SUBMIT BUTTON */}
          {(isSessionNo || (isSessionYes && formData.role && formData.peer_rating > 0 && formData.session_rating > 0 && formData.safeguard_issue)) && (
             <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" style={styles.primaryBtn} disabled={loading}>
             {loading ? <div style={{display:'flex', gap:'10px', justifyContent:'center'}}><Spinner size="20px" /> Saving...</div> : "Submit Feedback ✨"}
           </motion.button>
          )}

        </form>
      </motion.div>
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', background: colors.primary.berkeleyBlue, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: fonts.main },
  backBtn: { alignSelf: 'flex-start', marginBottom: '20px', background: 'transparent', border: `1px solid ${colors.secondary.electricBlue}`, color: colors.secondary.electricBlue, padding: '8px 16px', borderRadius: '20px', cursor: 'pointer' },
  card: { background: colors.primary.white, padding: '2.5rem', borderRadius: '16px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' },
  header: { textAlign: 'center', color: colors.primary.berkeleyBlue, marginBottom: '5px', fontSize: '1.8rem', fontWeight: 'bold' },
  subtext: { textAlign: 'center', color: '#666', marginBottom: '25px', fontSize: '0.95rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  section: { background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eee' },
  label: { fontWeight: '600', fontSize: '0.95rem', color: colors.primary.berkeleyBlue, marginBottom: '8px', display: 'block', marginTop: '10px' },
  hint: { fontSize: '0.8rem', color: '#777', marginTop: '-5px', marginBottom: '10px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' },
  select: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', background: 'white', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', minHeight: '80px', boxSizing: 'border-box', fontFamily: 'inherit' },
  radioGroup: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', cursor: 'pointer', background: 'white', padding: '10px', border: '1px solid #ddd', borderRadius: '8px' },
  stars: { display: 'flex', fontSize: '2.5rem', cursor: 'pointer', marginBottom: '15px' },
  star: { transition: 'color 0.2s' },
  alertBox: { background: '#fff3cd', color: '#856404', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '15px', border: '1px solid #ffeeba' },
  primaryBtn: { width: '100%', padding: '15px', marginTop: '10px', background: `linear-gradient(45deg, ${colors.primary.iris}, ${colors.secondary.electricBlue})`, border: 'none', borderRadius: '30px', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' },
};

export default PeerFeedbackPage;
