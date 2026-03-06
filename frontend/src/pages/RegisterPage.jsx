import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { colors, fonts } from '../theme';
import Spinner from '../components/Spinner';
import { API_URL } from '../config';

// --- FULL LIST OF COUNTRIES ---
const africanCountries = [
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde",
  "Cameroon", "Central African Republic", "Chad", "Comoros", "Congo (Brazzaville)",
  "Congo (Kinshasa)", "Côte d'Ivoire", "Djibouti", "Egypt", "Equatorial Guinea",
  "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea",
  "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
  "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger",
  "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal", "Seychelles",
  "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania",
  "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe", "Non-African"
];

// --- TIME ZONE MAPPING ---
const countryToTimezone = {
  "Algeria": "UTC+1", "Angola": "UTC+1", "Benin": "UTC+1", "Botswana": "UTC+2", "Burkina Faso": "UTC", "Burundi": "UTC+2", "Cabo Verde": "UTC-1",
  "Cameroon": "UTC+1", "Central African Republic": "UTC+1", "Chad": "UTC+1", "Comoros": "UTC+3", "Congo (Brazzaville)": "UTC+1",
  "Congo (Kinshasa)": "UTC+1", "Côte d'Ivoire": "UTC", "Djibouti": "UTC+3", "Egypt": "UTC+2", "Equatorial Guinea": "UTC+1",
  "Eritrea": "UTC+3", "Eswatini": "UTC+2", "Ethiopia": "UTC+3", "Gabon": "UTC+1", "Gambia": "UTC", "Ghana": "UTC", "Guinea": "UTC",
  "Guinea-Bissau": "UTC", "Kenya": "UTC+3", "Lesotho": "UTC+2", "Liberia": "UTC", "Libya": "UTC+2", "Madagascar": "UTC+3", "Malawi": "UTC+2",
  "Mali": "UTC", "Mauritania": "UTC", "Mauritius": "UTC+4", "Morocco": "UTC+1", "Mozambique": "UTC+2", "Namibia": "UTC+2", "Niger": "UTC+1",
  "Nigeria": "UTC+1", "Rwanda": "UTC+2", "Sao Tome and Principe": "UTC", "Senegal": "UTC", "Seychelles": "UTC+4",
  "Sierra Leone": "UTC", "Somalia": "UTC+3", "South Africa": "UTC+2", "South Sudan": "UTC+2", "Sudan": "UTC+2", "Tanzania": "UTC+3",
  "Togo": "UTC", "Tunisia": "UTC+1", "Uganda": "UTC+3", "Zambia": "UTC+2", "Zimbabwe": "UTC+2"
};

const utcOffsets = Array.from({ length: 27 }, (_, i) => {
    const offset = i - 12;
    return offset >= 0 ? `+${offset}` : `${offset}`;
});

const RegisterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  
  const program = location.state?.program || 'GD';
  const cohort = location.state?.cohort || 'Cohort 11';
  const connectionType = location.state?.connectionType || 'find';

  const isGraphicDesignC11 = program === 'GD' && cohort === 'Cohort 11';

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', country: '', timezone: '', language: '',
    open_to_global_pairing: 'No', 
    topic_module: '', 
    learning_preferences: '', availability: '', preferred_study_setup: '2', 
    kind_of_support: '', disclaimer_agree: false
  });

  useEffect(() => {
    if (isGraphicDesignC11) {
        setFormData(prev => ({
            ...prev,
            topic_module: "All Modules",
            learning_preferences: "Dedicated Accountability Partner", 
            preferred_study_setup: "2"
        }));
    }
  }, [isGraphicDesignC11]);

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const name = e.target.name;

    if (name === 'country') {
        if (value === 'Non-African') {
            setFormData({ ...formData, country: value, timezone: '' });
        } else {
            const tz = countryToTimezone[value] || '';
            setFormData({ ...formData, country: value, timezone: tz });
        }
    } else {
        setFormData({ ...formData, [name]: value });
    }
  };

  const getModules = () => {
    if (isGraphicDesignC11) return["Module 1 - Week 1 of Project 1","Module 2  - Week 2 of Project 1","Module 3 - Week 3 of Project 1",
                                  "Module 4 - Week 4 of Project 1","Module 5 - Week 1 of Project 2","Module 6 - Week 2 of Project 2",
                                  "Module 7 - Week 3 of Project 2","Module 8 - Week 1 of Project 3","Module 9 - Week 2 of Project 3",
                                  "Module 10 - Week 3 of Project 3","Module 11 - Week 1 of Project 4","Module 12 - Week 2 of Project 4",
                                  "Module 13 - Week 3 of Project 4","Module 14 - Week 4 of Project 4","Module 15 - Week 1 of Final Project",
                                  "Module 16 - Week 2 of final Project"];
    if (program === 'CC') return [
      "Week 1 Challenge", "Week 2 Challenge", "Week 3 Challenge", "Week 4 Challenge",
      "Week 5 Challenge", "Week 6 Challenge", "Week 7 Challenge", "Week 8 Challenge",
      "Week 9 Challenge", "Week 10 Challenge", "Week 11 Challenge", "Week 12 Challenge",
      "Week 13 Challenge", "Week 14 Challenge", "Final Project"
    ];
    return Array.from({length: 12}, (_, i) => `Week ${i+1} Challenge/Project`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = { ...formData, program, cohort, connection_type: connectionType };
    try {
      const response = await axios.post(`${API_URL}/api/register`, payload);
      if (response.data.success || response.data.user_id) {
        navigate(`/status/${response.data.user_id}`, { state: { isDuplicate: response.data.is_duplicate } });
      }
    } catch (error) { alert("Error: " + (error.response?.data?.error || error.message)); } 
    finally { setLoading(false); }
  };

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={() => navigate('/')}>&larr; Back</button>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} style={styles.card}>
        <h2 style={styles.header}>Register for {program} ({cohort})</h2>
        <p style={{textAlign:'center', marginBottom:'15px', color: '#666'}}>Looking for: <strong>{connectionType === 'find' ? 'Study Buddy' : connectionType}</strong></p>

        <div style={styles.warningBox}>
          <h3 style={styles.warningTitle}>⚠️ Please Read Carefully</h3>
          <ul style={styles.warningList}>
            <li>Show up for your partner — ghosting is discouraged.</li>
            <li>Provide accurate info only.</li>
            <li>Feel free to opt out at any time.</li>
            <li>Peer support is labelled as informal.</li>
             <li>Volunteers are here to support, not replace official facilitators/instructors.</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
           <div style={styles.row}>
             <div style={styles.half}><label style={styles.label}>Full Name</label><input style={styles.input} name="name" onChange={handleChange} required /></div>
             <div style={styles.half}><label style={styles.label}>Email (ALX Registered)</label><input style={styles.input} name="email" type="email" onChange={handleChange} required /></div>
           </div>
           
           <label style={styles.label}>Phone Number (WhatsApp)</label>
           <input style={styles.input} name="phone" type="tel" placeholder="+123..." onChange={handleChange} required />

           <div style={styles.row}>
              <div style={styles.half}>
                  <label style={styles.label}>Country</label>
                  <select style={styles.select} name="country" onChange={handleChange} required>
                      <option value="">--Select--</option>
                      {africanCountries.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                  </select>
              </div>
              <div style={styles.half}>
                  <label style={styles.label}>Time Zone</label>
                  {formData.country === 'Non-African' ? (
                      <div style={styles.tzWrapper}>
                          <span style={{ fontWeight: 'bold', color: '#555' }}>UTC</span>
                          <select style={styles.tzSelect} name="timezone" onChange={handleChange} required value={formData.timezone}>
                              <option value="">--</option>
                              {utcOffsets.map(off => <option key={off} value={`UTC${off}`}>{off}</option>)}
                          </select>
                      </div>
                  ) : (
                      <input style={{...styles.input, backgroundColor: '#f5f5f5', color: '#888', cursor: 'not-allowed'}} name="timezone" value={formData.timezone} readOnly placeholder="Auto-filled by country" required />
                  )}
              </div>
           </div>
           
           <div style={styles.row}>
             <div style={styles.half}>
                  <label style={styles.label}>Language</label>
                  <select style={styles.select} name="language" onChange={handleChange} required>
                      <option value="">--Select--</option><option value="English">English</option><option value="French">French</option><option value="Arabic">Arabic</option>
                  </select>
              </div>
             <div style={styles.half}>
                <label style={styles.label}>Availability</label>
                <select style={styles.select} name="availability" onChange={handleChange} required>
                 <option value="">--Select--</option><option value="Morning">Morning</option><option value="Afternoon">Afternoon</option><option value="Evening">Evening</option><option value="Flexible">Flexible</option>
               </select>
             </div>
           </div>

           <div style={styles.row}>
             <div style={styles.half}>
                <label style={styles.label}>Current Week/Module</label>
                <select style={styles.select} name="topic_module" onChange={handleChange} required value={formData.topic_module}>
                    {!isGraphicDesignC11 && <option value="">--Select--</option>}
                    {getModules().map(m => <option key={m} value={m}>{m}</option>)}
                </select>
             </div>
             <div style={styles.half}>
                <label style={styles.label}>Learning Preference</label>
                <select style={styles.select} name="learning_preferences" onChange={handleChange} required value={formData.learning_preferences}>
                {isGraphicDesignC11 ? (
                    <option value="Dedicated Accountability Partner">Dedicated Accountability Partner</option>
                ) : (
                    <>
                        <option value="">--Select--</option>
                        <option value="Deep dive">Deep dive</option>
                        <option value="Co-work sessions">Co-work sessions</option>
                        <option value="General program navigation">General program navigation</option>
                        <option value="Coffee Chat">Coffee chat</option>
                    </>
                )}
                </select>
             </div>
           </div>

           <div>
             <label style={styles.label}>Open to Global Pairing?</label>
             <select style={styles.select} name="open_to_global_pairing" onChange={handleChange} required value={formData.open_to_global_pairing}>
                <option value="No">No - Match within my Country/Module/Availability</option>
                <option value="Yes">Yes - Match me with anyone (Faster)</option>
             </select>
             <p style={{fontSize:'0.8rem', color:'#666', marginTop:'5px', marginBottom:'15px'}}>*Select 'Yes' to relax constraints and find a match faster.</p>
           </div>

           {connectionType === 'find' && (
             <div>
                <label style={styles.label}>Preferred Group Size</label>
                {isGraphicDesignC11 ? (
                    <select style={styles.select} name="preferred_study_setup" value="2" disabled={true}>
                        <option value="2">Pair (2 People)</option>
                    </select>
                ) : (
                    <select style={styles.select} name="preferred_study_setup" onChange={handleChange} required>
                        <option value="2">Pair (2 people)</option>
                        <option value="3">Group of 3</option>
                    </select>
                )}
             </div>
           )}
           
           {connectionType !== 'find' && (
             <div><label style={styles.label}>Support Type</label><select style={styles.select} name="kind_of_support" onChange={handleChange} required><option value="">--Select--</option><option value="Content Explanation">Content Explanation</option><option value="Test or Milestone clarification">Test or Milestone clarification</option><option value="Full support">Full support</option></select></div>
           )}

           <div style={styles.checkboxContainer}>
                <input type="checkbox" name="disclaimer_agree" onChange={handleChange} required style={{accentColor: colors.primary.iris}}/>
                <label style={{marginLeft:'10px', fontSize: '0.9rem'}}>
                    I accept the <Link to="/disclaimer" target="_blank" style={{color: colors.primary.iris, textDecoration: 'underline', fontWeight: 'bold'}}>Disclaimer</Link>.
                </label>
           </div>

           <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" style={styles.submitButton} disabled={loading}>
              {loading ? <div style={{display:'flex', gap:'10px', justifyContent:'center'}}><Spinner size="20px" /> Processing...</div> : "Submit Request 🚀"}
           </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', background: colors.primary.berkeleyBlue, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: fonts.main },
  backBtn: { alignSelf: 'flex-start', marginBottom: '20px', background: 'transparent', border: `1px solid ${colors.secondary.electricBlue}`, color: colors.secondary.electricBlue, padding: '8px 16px', borderRadius: '20px', cursor: 'pointer' },
  card: { background: colors.primary.white, padding: '2.5rem', borderRadius: '16px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' },
  header: { textAlign: 'center', color: colors.primary.berkeleyBlue, marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold' },
  warningBox: { background: '#fffbf0', border: `1px solid ${colors.secondary.gold}`, borderRadius: '12px', padding: '15px', marginBottom: '25px', color: '#856404' },
  warningTitle: { margin: '0 0 10px 0', fontSize: '1rem', color: colors.secondary.tomato },
  warningList: { paddingLeft: '20px', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  row: { display: 'flex', gap: '15px' },
  half: { flex: 1 },
  label: { fontWeight: '600', fontSize: '0.9rem', color: colors.primary.berkeleyBlue, marginBottom: '5px', display: 'block' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box', outlineColor: colors.secondary.electricBlue },
  select: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', backgroundColor: 'white', boxSizing: 'border-box' },
  tzWrapper: { display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #ddd', borderRadius: '8px', paddingLeft: '12px', overflow: 'hidden' },
  tzSelect: { border: 'none', background: 'transparent', width: '100%', padding: '12px 5px', outline: 'none', fontSize: '1rem', cursor: 'pointer' },
  submitButton: { padding: '15px', marginTop: '20px', background: `linear-gradient(45deg, ${colors.primary.iris}, ${colors.secondary.electricBlue})`, border: 'none', borderRadius: '30px', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' },
  checkboxContainer: { display: 'flex', alignItems: 'center', marginTop: '10px' },
};

export default RegisterPage;

