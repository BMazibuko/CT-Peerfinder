import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { colors, fonts } from '../theme';
import Spinner from '../components/Spinner';
import { API_URL } from '../config';

const StatusPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [matchMessage, setMatchMessage] = useState(null); 
  
  // --- UNPAIR & FEEDBACK STATE ---
  const [showUnpairModal, setShowUnpairModal] = useState(false);
  const [unpairReason, setUnpairReason] = useState("");
  const [unpairAction, setUnpairAction] = useState('requeue');
  const [loadingUnpair, setLoadingUnpair] = useState(false); // NEW: Spinner state for unpairing
  
  // Custom Feedback Modal State
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, title: '', message: '', type: 'success', redirect: null });
  
  const isDuplicate = location.state?.isDuplicate;

  const fetchStatus = async () => {
    try {
      console.log(`fetching: ${API_URL}/api/status/${userId}`); 
      const res = await axios.get(`${API_URL}/api/status/${userId}?t=${Date.now()}`);
      
      const data = res.data;
      if (data.success || data.user || data.matched !== undefined) {
        setStatus(data);
        setError(null);
      } else {
        console.warn("Invalid Data Structure:", data);
        setError("User not found in the system.");
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setError("Unable to load status. Please check your Email, User ID or internet connection.");
    }
  };

  useEffect(() => {
    if (userId) {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); 
        return () => clearInterval(interval);
    } else {
        setError("Invalid User ID.");
    }
  }, [userId]);

  const handleManualMatch = async () => {
    setLoadingMatch(true);
    setMatchMessage(null); 
    
    try {
      const activeId = status?.real_id || userId; 
      const res = await axios.post(`${API_URL}/api/match`, { user_id: activeId });
      if (!res.data.matched) {
        setMatchMessage("No match found yet. Please try again soon!");
      }
      fetchStatus(); 
    } catch (err) {
      setMatchMessage("Could not check for matches. Please try again.");
    } finally {
      setLoadingMatch(false);
    }
  };

  const handleLeaveGroup = async () => {
    setLoadingUnpair(true); // Start the spinner
    try {
      const activeId = status?.real_id || userId;
      
      await axios.post(`${API_URL}/api/leave-group`, { 
        user_id: activeId, 
        reason: status.matched ? unpairReason : 'Deleted from queue',
        delete_profile: unpairAction === 'delete' 
      });
      
      setShowUnpairModal(false); // Hide input modal only AFTER successful api call
      
      if (unpairAction === 'delete') {
          setFeedbackModal({
              isOpen: true,
              title: "Profile Deleted 👋",
              message: "Your profile has been completely deleted. You can re-register whenever you are ready!",
              type: "success",
              redirect: '/'
          });
      } else {
          setFeedbackModal({
              isOpen: true,
              title: "Success! 🚫",
              message: "You have successfully left the group.\n\n💡 TIP: If you want to change your preferences (like availability, topic, or group size), simply go back to the Home page and register again using the exact same email!",
              type: "success",
              redirect: 'reload'
          });
      }
    } catch (err) {
      setShowUnpairModal(false);
      setFeedbackModal({
          isOpen: true,
          title: "Error ❌",
          message: "Error processing your request. Please try again.",
          type: "error",
          redirect: null
      });
    } finally {
      setLoadingUnpair(false); // Stop the spinner
    }
  };

  const handleFeedbackClose = () => {
      const redirectAction = feedbackModal.redirect;
      setFeedbackModal({ ...feedbackModal, isOpen: false });
      
      if (redirectAction === '/') {
          navigate('/');
      } else if (redirectAction === 'reload') {
          window.location.reload();
      }
  };

  // --- ERROR STATE ---
  if (error) return (
    <div style={styles.loadingContainer}>
       <h3 style={{color: colors.secondary.tomato}}>Error Loading Status</h3>
       <p style={{color: 'white', marginBottom: '20px'}}>{error}</p>
       <div style={{display:'flex', gap:'10px'}}>
         <button onClick={() => window.location.reload()} style={styles.retryBtn}>Retry</button>
         <button onClick={() => navigate('/')} style={styles.homeBtn}>Back to Home</button>
       </div>
    </div>
  );

  // --- LOADING STATE ---
  if (!status) return (
    <div style={styles.loadingContainer}>
       <Spinner size="40px" color={colors.secondary.electricBlue} />
       <p style={{marginTop: '20px', color: 'white'}}>Loading status...</p>
    </div>
  );

  // --- SUCCESS STATE ---
  return (
    <div style={styles.container}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={styles.card}>
        
        <h1 style={{...styles.title, color: status.matched ? colors.primary.springGreen : colors.secondary.gold}}>
          {status.matched 
             ? (isDuplicate ? "You are Already Matched! 🎉" : "It's a Match! 🎉") 
             : (isDuplicate ? "You are Already in Queue ⏳" : "You are in the Queue ⏳")
          }
        </h1>

        {/* === MATCHED === */}
        {status.matched ? (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={styles.successBox}>
            <h3 style={styles.subTitle}>Meet Your Peer Group:</h3>
            <div style={styles.list}>
              {status.group?.map((member, idx) => {
                 // Check if this card belongs to the current user
                 const isMe = member.name === status.user?.name;
                 // Clean the phone number for WhatsApp link
                 const cleanPhone = String(member.phone || '').replace(/\D/g, '');

                 return (
                   <div key={idx} style={styles.memberRow}>
                     <span style={styles.memberName}>{member.name} {isMe && <span style={{color: '#888', fontSize: '0.9rem'}}>(You)</span>}</span>
                     <div style={styles.contactInfo}>
                       <span>📧 {member.email}</span>
                       <span>📱 {member.phone}</span>
                     </div>
                     {/* WhatsApp Button logic */}
                     {!isMe && cleanPhone && (
                       <a 
                         href={`https://wa.me/${cleanPhone}`} 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         style={styles.waBtn}
                       >
                         💬 Message on WhatsApp
                       </a>
                     )}
                   </div>
                 );
              })}
            </div>
            <p style={styles.note}>Please contact your peer(s) now. <br />Check your email for more details!</p>

            <div style={{marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '15px', textAlign: 'center'}}>
                <p style={{fontSize:'0.8rem', color:'#999', marginBottom: '5px'}}>Group inactive or need a break?</p>
                <button 
                    onClick={() => { setUnpairAction('requeue'); setUnpairReason(""); setShowUnpairModal(true); }}
                    style={{background:'none', border:'none', color:'#d32f2f', textDecoration:'underline', cursor:'pointer', fontSize:'0.85rem'}}
                >
                    Leave Group / Unpair Me
                </button>
            </div>
          </motion.div>
        ) : (
          /* === WAITING === */
          <div style={styles.waitingBox}>
            <p style={styles.waitingText}>
              {isDuplicate 
                ? "You have already registered. We are still looking for a peer who matches your schedule."
                : `Hang tight! We are looking for the perfect peers in ${status.user?.cohort || 'your cohort'} who match your schedule.`
              }
            </p>
            <div style={styles.idBox}>
              <span>Your Unique ID:</span>
              <strong style={{fontSize: '1.2rem', color: colors.primary.berkeleyBlue}}>{status.real_id || userId}</strong>
            </div>
            
            <motion.button 
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={handleManualMatch} disabled={loadingMatch} style={styles.findBtn}
            >
               {loadingMatch ? <div style={{display:'flex', gap:'10px', alignItems:'center', justifyContent:'center'}}><Spinner size="18px" /> Finding Match...</div> : "Find Matches Now 🚀"}
            </motion.button>

            {matchMessage && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={styles.noticeBox}>{matchMessage}</motion.div>
            )}

            <div style={{marginTop: '30px', borderTop: '1px solid #ddd', paddingTop: '15px', textAlign: 'center'}}>
                <p style={{fontSize:'0.8rem', color:'#999', marginBottom: '5px'}}>Need to take a break or entered wrong details?</p>
                <button 
                    onClick={() => { setUnpairAction('delete'); setShowUnpairModal(true); }}
                    style={{background:'none', border:'none', color:'#d32f2f', textDecoration:'underline', cursor:'pointer', fontSize:'0.85rem'}}
                >
                    Delete My Request
                </button>
            </div>

            <p style={{fontSize: '0.8rem', color: '#666', marginTop: '15px'}}>
              (Save this ID to check back later)
            </p>
          </div>
        )}

        <button style={styles.homeBtn} onClick={() => navigate('/')}>Back to Home</button>
      </motion.div>

      {/* UNPAIR/DELETE INPUT MODAL */}
      <AnimatePresence>
        {showUnpairModal && (
          <div style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} style={{...styles.card, maxWidth: '450px', padding: '2rem'}}>
                  <h3 style={{color:'#d32f2f', marginTop: 0}}>
                      {status.matched ? "Leave Group? ⚠️" : "Delete Request? ⚠️"}
                  </h3>
                  
                  {status.matched && (
                      <div style={{textAlign: 'left', marginBottom: '15px', background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #eee'}}>
                          <label style={{display: 'flex', gap: '10px', marginBottom: '12px', cursor: 'pointer', fontSize: '0.95rem', color: colors.primary.berkeleyBlue}}>
                              <input 
                                  type="radio" name="action" 
                                  checked={unpairAction === 'requeue'} 
                                  onChange={() => setUnpairAction('requeue')} 
                                  style={{accentColor: colors.primary.iris, marginTop: '4px'}}
                              />
                              <span><strong>Rematch me again</strong> <br/><span style={{fontSize:'0.8rem', color:'#666'}}>Return to the queue for a new partner</span></span>
                          </label>
                          <label style={{display: 'flex', gap: '10px', cursor: 'pointer', fontSize: '0.95rem', color: colors.primary.berkeleyBlue}}>
                              <input 
                                  type="radio" name="action" 
                                  checked={unpairAction === 'delete'} 
                                  onChange={() => setUnpairAction('delete')} 
                                  style={{accentColor: colors.primary.iris, marginTop: '4px'}}
                              />
                              <span><strong>Completely delete me</strong> <br/><span style={{fontSize:'0.8rem', color:'#666'}}>I'll re-register when I'm ready</span></span>
                          </label>
                      </div>
                  )}

                  {unpairAction === 'delete' && !status.matched && (
                      <p style={{fontSize:'0.95rem', color: '#555', marginBottom: '15px'}}>
                          This will permanently delete your request from the system. You will need to register again to find a peer.
                      </p>
                  )}

                  {status.matched && (
                      <textarea 
                          placeholder="Reason for leaving (Required) - e.g., Ghosting, Inactive"
                          value={unpairReason} 
                          onChange={e => setUnpairReason(e.target.value)}
                          style={{width:'100%', padding:'10px', marginTop:'10px', borderRadius:'5px', border:'1px solid #ccc', fontFamily: 'inherit'}}
                      />
                  )}

                  <div style={{display:'flex', gap:'10px', marginTop:'20px', justifyContent:'center'}}>
                      <button onClick={() => setShowUnpairModal(false)} style={{padding:'10px 20px', border:'1px solid #ccc', background:'white', borderRadius:'5px', cursor:'pointer'}} disabled={loadingUnpair}>Cancel</button>
                      <button 
                          onClick={handleLeaveGroup} 
                          disabled={(status.matched && !unpairReason.trim()) || loadingUnpair}
                          style={{
                              background: '#d32f2f', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', 
                              cursor: ((status.matched && !unpairReason.trim()) || loadingUnpair) ? 'not-allowed' : 'pointer', 
                              opacity: ((status.matched && !unpairReason.trim()) || loadingUnpair) ? 0.5 : 1, fontWeight: 'bold'
                          }}
                      >
                          {loadingUnpair ? (
                              <div style={{display:'flex', gap:'8px', alignItems:'center', justifyContent:'center'}}>
                                  <Spinner size="16px" /> Processing...
                              </div>
                          ) : "Confirm"}
                      </button>
                  </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM FEEDBACK SUCCESS/ERROR MODAL */}
      <AnimatePresence>
        {feedbackModal.isOpen && (
          <div style={styles.modalOverlay}>
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} style={{...styles.card, maxWidth: '400px', padding: '2rem'}}>
                  <h3 style={{color: feedbackModal.type === 'success' ? colors.primary.springGreen : colors.secondary.tomato, marginTop: 0}}>
                      {feedbackModal.title}
                  </h3>
                  <p style={{fontSize:'0.95rem', color: '#555', marginBottom: '25px', whiteSpace: 'pre-wrap', lineHeight: '1.5'}}>
                      {feedbackModal.message}
                  </p>
                  <button onClick={handleFeedbackClose} style={styles.modalOkBtn}>
                      OK, got it
                  </button>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', background: colors.primary.berkeleyBlue, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', fontFamily: fonts.main },
  loadingContainer: { minHeight: '100vh', background: colors.primary.berkeleyBlue, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  card: { background: colors.primary.white, padding: '3rem', borderRadius: '20px', maxWidth: '600px', width: '100%', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' },
  title: { margin: '0 0 1.5rem 0', fontSize: '2rem' },
  subTitle: { color: colors.primary.berkeleyBlue, margin: '0 0 1rem 0' },
  successBox: { background: '#e6fffa', border: `2px solid ${colors.primary.springGreen}`, borderRadius: '15px', padding: '20px', textAlign: 'left' },
  list: { display: 'flex', flexDirection: 'column', gap: '15px' },
  memberRow: { background: 'white', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
  memberName: { display: 'block', fontWeight: 'bold', fontSize: '1.1rem', color: colors.primary.berkeleyBlue, marginBottom: '5px' },
  contactInfo: { display: 'flex', flexDirection: 'column', fontSize: '0.9rem', color: '#555', gap: '2px' },
  note: { marginTop: '15px', fontStyle: 'italic', fontSize: '0.9rem', color: '#666' },
  waitingBox: { padding: '20px', background: '#f8f9fa', borderRadius: '15px', marginBottom: '20px' },
  waitingText: { fontSize: '1.1rem', lineHeight: '1.6', color: '#444', marginBottom: '20px' },
  idBox: { background: colors.secondary.electricBlue + '33', padding: '15px', borderRadius: '10px', border: `1px dashed ${colors.secondary.electricBlue}`, display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' },
  findBtn: { width: '100%', padding: '15px', background: colors.primary.iris, color: 'white', border: 'none', borderRadius: '30px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' },
  noticeBox: { marginTop: '15px', padding: '10px', background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold' },
  homeBtn: { marginTop: '30px', padding: '12px 24px', background: 'transparent', border: `2px solid ${colors.primary.iris}`, color: colors.primary.iris, borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' },
  retryBtn: { marginTop: '30px', padding: '12px 24px', background: 'white', border: 'none', color: colors.primary.berkeleyBlue, borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 43, 86, 0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalOkBtn: { padding: '12px 30px', background: colors.primary.iris, color: 'white', border: 'none', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' },
  waBtn: { display: 'inline-block', marginTop: '12px', padding: '8px 16px', backgroundColor: '#25D366', color: 'white', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }
};

export default StatusPage;
