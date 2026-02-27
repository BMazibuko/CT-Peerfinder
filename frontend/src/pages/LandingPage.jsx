import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { colors, fonts } from '../theme';
import { API_URL } from '../config';

// --- SLIDESHOW DATA ---
const slides = [
  { id: 1, image: "/slide1.jpg", text: "It's a Match! 🎉", subtext: "Register and get paired instantly." },
  { id: 2, image: "/slide2.jpg", text: "💬 Let's meet!", subtext: "Connect via WhatsApp immediately." },
  { id: 3, image: "/slide3.jpg", text: "Collaborate & Grow 🚀", subtext: "Work on Milestones and projects together." },
  { id: 4, image: "/alx_white.png", text: "ALX Peer Finder", subtext: "Study together", isLogo: true }
];

const HeroSlideshow = () => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={styles.slideshowContainer}>
      <AnimatePresence mode='wait'>
        <motion.div key={index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} style={styles.slide}>
          <div style={{...styles.image, backgroundImage: `url(${slides[index].image})`, backgroundSize: slides[index].isLogo ? 'contain' : 'cover'}} />
          <div style={styles.overlay} />
        </motion.div>
      </AnimatePresence>
      <div style={styles.slideContentWrapper}>
        <motion.div key={index} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h2 style={styles.slideTitle}>{slides[index].text}</h2>
          <p style={styles.slideSubtext}>{slides[index].subtext}</p>
        </motion.div>
      </div>
    </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  
  // Selection State
  const [step, setStep] = useState(1);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedCohort, setSelectedCohort] = useState(null);

  const programs = [
    { id: 'VA', name: 'Virtual Assistant', icon: '💻', cohorts: ['Cohort 14'] },
    { id: 'AiCE', name: 'AI Career Essentials', icon: '🤖', cohorts: ['Cohort 17'] },
    { id: 'PF', name: 'Prof. Foundations', icon: '🚀', cohorts: ['Cohort 12'] },
  ];

  // Feedback State
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  const resetModal = () => { setShowModal(false); setStep(1); setSelectedProgram(null); setSelectedCohort(null); };

  const submitFeedback = async () => {
    try {
      await axios.post(`${API_URL}/api/feedback`, { rating, comment });
      setFeedbackSent(true);
      setTimeout(() => { setShowFeedback(false); setFeedbackSent(false); setRating(0); setComment(""); }, 2000);
    } catch (err) { alert("Error sending feedback"); }
  };

  const handleOptionSelect = (type) => {
    navigate('/register', { state: { program: selectedProgram.id, cohort: selectedCohort, connectionType: type } });
  };

  // Helper to check restricted cohorts (VA C13 & AiCE C17)
  const isRestrictedCohort = () => {
    if (selectedProgram?.id === 'VA' && selectedCohort === 'Cohort 14') return true;
    if (selectedProgram?.id === 'AiCE' && selectedCohort === 'Cohort 18') return true;
    return false;
  };

  return (
    <div style={styles.container}>
      <nav style={styles.navbar}>
        <div style={styles.navLeft}>
          <img src="/alx_icon-300x169.png" alt="ALX" style={{height: '35px', marginRight: '10px'}} /> 
          <span style={styles.logoText}>PeerFinder</span>
        </div>
        <Link to="/admin" style={styles.adminLink}>Admin</Link>
      </nav>

      <div style={styles.heroSection}>
        <HeroSlideshow />
        <div style={styles.heroForeground}>
          <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} style={styles.heroTextContainer}>
            <h1 style={styles.heroTitle}>Learn better, <span style={{color: colors.secondary.electricBlue}}>together.</span></h1>
            <p style={styles.heroParagraph}>Discover peers and mentors in your cohort to share ideas, tackle projects, and celebrate wins.</p>
            <div style={styles.heroButtons}>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowModal(true)} style={styles.primaryBtn}>Get Started 🚀</motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/status/check')} style={styles.secondaryBtn}>Check Status</motion.button>
            </div>
          </motion.div>
          {/* <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} style={styles.videoWrapper}>
            <iframe src="https://www.youtube.com/embed/78uUL2WFo0k" title="PeerFinder Walkthrough" style={styles.iframe} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          </motion.div> */}
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div style={styles.modalOverlay} onClick={resetModal}>
            <motion.div style={styles.modalCard} onClick={e => e.stopPropagation()}>
              
              {/* Step 1: Program Selection */}
              {step === 1 && (
                <>
                  <h2 style={{color: colors.primary.berkeleyBlue}}>Select Program 🎓</h2>
                  <div style={{display: 'flex', flexDirection: 'row', gap: '15px', justifyContent: 'center', marginTop:'20px'}}>
                    {programs.map(p => (
                      <motion.button key={p.id} whileHover={{ scale: 1.1, backgroundColor: colors.primary.iris, color: 'white', border: 'none' }} whileTap={{ scale: 0.95 }} style={styles.programBtn} onClick={() => { setSelectedProgram(p); setStep(2); }}>
                        <span style={{fontSize: '2rem', display:'block', marginBottom:'5px'}}>{p.icon}</span>
                        {p.name}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}

              {/* Step 2: Cohort Selection */}
              {step === 2 && (
                <>
                  <button style={styles.backLink} onClick={() => setStep(1)}>&larr; Back</button>
                  <h2 style={{color: colors.primary.berkeleyBlue}}>Select Cohort</h2>
                  <div style={styles.modalGrid}>
                    {selectedProgram.cohorts.map(c => (
                      <motion.button key={c} whileHover={{ scale: 1.05, backgroundColor: colors.primary.iris, color: 'white' }} style={styles.optionBtn} onClick={() => { setSelectedCohort(c); setStep(3); }}>{c}</motion.button>
                    ))}
                  </div>
                </>
              )}

              {/* Step 3: Option Selection */}
              {step === 3 && (
                <>
                  <button style={styles.backLink} onClick={() => setStep(2)}>&larr; Back</button>
                  <h2 style={{color: colors.primary.berkeleyBlue}}>Options</h2>
                  <div style={styles.modalGrid}>
                    <OptionCard title="Find a Study Buddy 🤝" desc="Accountability Partner / Group" color={colors.primary.iris} onClick={() => handleOptionSelect('find')} />
                    
                    {/* HIDE OTHER OPTIONS FOR RESTRICTED COHORTS (VA C13, AiCE C17) */}
                    {!isRestrictedCohort() && (
                      <>
                        <OptionCard title="Offer Support 💁‍♀️" desc="Volunteer Mode ⭐⭐⭐ " color={colors.primary.springGreen} textColor={colors.primary.berkeleyBlue} onClick={() => handleOptionSelect('offer')} />
                        <OptionCard title="Request Support 🆘" desc="I am Behind / Struggling" color={colors.secondary.tomato} onClick={() => handleOptionSelect('need')} />
                      </>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={styles.infoSection}>
        <InfoBlock title="Collaborate, Grow, and Achieve Together" text="Learning is more rewarding when shared. PeerFinder helps you discover learners who match your rhythm and goals, so you can support each other, exchange ideas, and stay motivated throughout your journey." />
        <InfoBlock title="Tailored Connections" text="Whether you prefer focused one-on-one partnerships or dynamic groups of three or five, PeerFinder matches you with peers who have similar progress and commitment levels." />
      </div>

      <footer style={styles.footer}>
        Built for the ALX Community. <br/>
        © 2026 Peer Finder. All rights reserved.
      </footer>

      {/* --- FLOATING BUTTONS --- */}
      <button onClick={() => setShowFeedback(true)} style={styles.feedbackBtn}>Rate the Peer Finder ⭐</button>
      
      {/* NEW: Peer Session Feedback Button */}
      <motion.button 
        whileHover={{ scale: 1.05 }} 
        whileTap={{ scale: 0.95 }} 
        onClick={() => navigate('/peer-feedback')} 
        style={styles.peerFeedbackBtn}
      >
        IMPORTANT🌟 Rate Your Peer(s) / Session
      </motion.button>
      
      {/* Tool Feedback Modal */}
      {showFeedback && (
        <div style={styles.modalOverlay} onClick={() => setShowFeedback(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            {feedbackSent ? <h3 style={{color: 'green'}}>Thank you! ❤️</h3> : (
              <>
                <h3>Rate your experience</h3>
                <div style={{display:'flex', justifyContent:'center', fontSize:'2rem', cursor:'pointer', margin:'10px 0'}}>
                  {[1,2,3,4,5].map(s => <span key={s} onClick={() => setRating(s)} style={{color: s <= rating ? '#FFD700' : '#ddd'}}>★</span>)}
                </div>
                <textarea placeholder="Any suggestions for improvement?" value={comment} onChange={e => setComment(e.target.value)} style={{width:'100%', padding:'10px', margin:'10px 0'}} />
                <button onClick={submitFeedback} disabled={!rating} style={styles.primaryBtn}>Submit</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const InfoBlock = ({ title, text }) => (
  <div style={{marginBottom: '2rem'}}>
    <h3 style={styles.infoTitle}>{title}</h3>
    <p style={styles.infoText}>{text}</p>
  </div>
);

const OptionCard = ({ title, desc, color, textColor='white', onClick }) => (
  <motion.button whileHover={{scale: 1.02}} onClick={onClick} style={{...styles.optionCard, background: color, color: textColor}}>
    <div style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{title}</div>
    <div style={{fontSize: '0.9rem', opacity: 0.9}}>{desc}</div>
  </motion.button>
);

const styles = {
  container: { minHeight: '100vh', background: colors.primary.berkeleyBlue, fontFamily: fonts.main, position:'relative' },
  navbar: { display: 'flex', justifyContent: 'space-between', padding: '1rem 2rem', background: 'white', zIndex: 100, position:'relative' },
  logoText: { color: colors.primary.iris, fontWeight: '700', fontSize: '1.5rem' },
  adminLink: { color: colors.primary.iris, textDecoration: 'none', fontWeight: '600' },
  heroSection: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position:'relative', overflow:'hidden' },
  slideshowContainer: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  slide: { position: 'absolute', width: '100%', height: '100%' },
  image: { width: '100%', height: '100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' },
  overlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,43,86,0.6)' },
  slideContentWrapper: { position: 'absolute', bottom: '15%', width: '100%', textAlign: 'center', color: 'white', zIndex: 2 },
  heroForeground: { position: 'relative', zIndex: 10, display: 'flex', flexWrap:'wrap', justifyContent:'center', alignItems:'center', gap:'3rem', padding:'2rem', width:'100%', maxWidth:'1200px' },
  heroTextContainer: { flex: '1', minWidth: '300px', maxWidth: '550px', textAlign: 'left', color: 'white' },
  heroTitle: { fontSize: '3.5rem', fontWeight: '800', lineHeight: '1.1', marginBottom: '1rem' },
  heroParagraph: { fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '2rem', color: '#e0e0e0' },
  heroButtons: { display: 'flex', gap: '15px' },
  primaryBtn: { padding: '12px 30px', borderRadius: '30px', border: 'none', background: colors.secondary.electricBlue, color: colors.primary.berkeleyBlue, fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(39, 222, 242, 0.4)' },
  secondaryBtn: { padding: '12px 30px', borderRadius: '30px', border: '2px solid white', background: 'transparent', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' },
  videoWrapper: { flex: '1', minWidth: '300px', maxWidth: '560px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', aspectRatio: '16/9', border: `1px solid rgba(255,255,255,0.1)` },
  iframe: { width: '100%', height: '100%', border: 'none' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { background: 'white', padding: '3rem', borderRadius: '20px', textAlign: 'center', maxWidth: '600px', width: '90%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' },
  modalGrid: { display: 'flex', flexDirection: 'column', gap: '15px' },
  optionBtn: { padding: '15px', borderRadius: '10px', border: '1px solid #ddd', background: '#f9f9f9', fontSize: '1.1rem', fontWeight: '600', color: colors.primary.berkeleyBlue, cursor: 'pointer' },
  optionCard: { padding: '15px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  backLink: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', marginBottom: '10px', fontSize: '0.9rem' },
  programBtn: { width: '140px', height: '140px', borderRadius: '15px', border: '1px solid #eee', background: 'white', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', color: colors.primary.berkeleyBlue, fontSize: '0.9rem', textAlign: 'center', padding: '10px' },
  infoSection: { padding: '4rem 2rem', background: '#d1dbf8', color: colors.primary.berkeleyBlue, textAlign: 'center' },
  infoTitle: { fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' },
  infoText: { fontSize: '1.1rem', lineHeight: '1.6', maxWidth: '700px', margin: '0 auto' },
  footer: { background: colors.primary.berkeleyBlue, color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.1)' },
  feedbackBtn: { position: 'fixed', bottom: '20px', left: '20px', padding: '10px 20px', borderRadius: '30px', border: 'none', background: colors.primary.iris, color: 'white', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '5px', zIndex: 100 },
  peerFeedbackBtn: { position: 'fixed', bottom: '20px', right: '20px', padding: '12px 24px', borderRadius: '30px', border: 'none', background: colors.secondary.tomato, color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100 }
};

export default LandingPage;





