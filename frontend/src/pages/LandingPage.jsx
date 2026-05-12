import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { colors, fonts } from '../theme';
import { API_URL } from '../config';

// --- MASTER VERTICAL CONFIGURATION (Updated for CT) ---
const VERTICALS = {
  CA: {
    name: 'CAREER ACCELERATOR',
    color: '#003366',
    programs: [
      { id: 'VA', name: 'Virtual Assistant', courses: ['VA-1: VA Foundations', 'VA-2: Core Professional Skills', 'VA-3: Tech Tools', 'VA-4: Task Execution', 'VA-5: Career Readiness', 'VA-6: Specialisation'] },
      { id: 'AiCE', name: 'AI Career Essentials', courses: ['AICE-1: AI Foundations', 'AICE-2: Prompting', 'AICE-3: Ethical AI', 'AICE-4: Creative Content', 'AICE-5: Data Analysis', 'AICE-6: AI Portfolio'] },
      { id: 'PF', name: 'Professional Foundations', courses: ['PF-1: Self-Leadership', 'PF-2: Communication', 'PF-3: Problem Solving', 'PF-4: Career Readiness'] }
    ]
  },
  CT: {
    name: 'CREATIVE TECH',
    color: '#f32c2c', // Creative Tech Red
    programs: [
      { 
        id: 'GD', 
        name: 'Graphic Design', 
        courses: [
          'GD-1: Design Foundations & Visual Literacy',
          'GD-2: Color Theory & Application',
          'GD-3: Vector Graphics & Illustration',
          'GD-4: Typography & Layout Design',
          'GD-5: Editorial & Magazine Design',
          'GD-6: Designing for Social Media',
          'GD-7: Brand Strategy for Designers',
          'GD-8: AI for Graphic Design',
          'GD-9: Portfolio Development',
          'GD-10: Freelancing & Business Skills'
        ] 
      },
      { 
        id: 'CC', 
        name: 'Content Creation', 
        courses: [
          'CC-1: Storytelling & Content Strategy',
          'CC-2: Digital Content Production',
          'CC-3: Content Marketing & Distribution',
          'CC-4: Monetization & Personal Branding',
          'CC-5: Content Creation Capstone'
        ] 
      }
    ]
  }
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // --- LOGIC ---
  const handleProgramClick = (program) => {
    setSelectedProgram(program);
    setShowProgramModal(true);
  };

  const handleCourseClick = (course) => {
    setSelectedCourse(course);
    setShowTypeModal(true);
  };

  const handleTypeSelect = (type) => {
    // Navigate to Registration with state
    navigate('/register', { 
      state: { 
        program: selectedProgram.id, 
        course: selectedCourse, 
        connectionType: type 
      } 
    });
  };

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <section style={styles.hero}>
        <motion.h1 
          initial={{ y: 20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }}
          style={styles.mainTitle}
        >
          ALX Peer Finder
        </motion.h1>
        <p style={styles.heroSub}>The official marketplace to find study peers, unblock your milestones, and grow together.</p>
      </section>

      {/* Vertical Selector Grid */}
      <section style={styles.gridSection}>
        <h2 style={styles.sectionHeader}>Select Your Program Vertical</h2>
        <div style={styles.verticalGrid}>
          {Object.entries(VERTICALS).map(([key, vertical]) => (
            <div key={key} style={styles.verticalColumn}>
              <div style={{ ...styles.verticalHeader, color: vertical.color }}>{vertical.name}</div>
              {vertical.programs.map(prog => (
                <motion.div 
                  key={prog.id} 
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleProgramClick(prog)}
                  style={styles.programTile}
                >
                  {prog.name}
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Course Selection Modal */}
      <AnimatePresence>
        {showProgramModal && (
          <motion.div style={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div style={styles.modalCard} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
              <div style={styles.modalHeader}>
                <h3>{selectedProgram?.name} - Select Course</h3>
                <button onClick={() => setShowProgramModal(false)} style={styles.closeBtn}>×</button>
              </div>
              <div style={styles.courseGrid}>
                {selectedProgram?.courses.map(course => (
                  <button key={course} onClick={() => handleCourseClick(course)} style={styles.courseBtn}>
                    {course}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Type Modal (Learner vs Volunteer) */}
      <AnimatePresence>
        {showTypeModal && (
          <motion.div style={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.div style={styles.modalCard} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
              <div style={styles.modalHeader}>
                <h3>How do you want to connect?</h3>
                <button onClick={() => setShowTypeModal(false)} style={styles.closeBtn}>×</button>
              </div>
              <p style={styles.typeSub}>{selectedCourse}</p>
              <div style={styles.typeGrid}>
                <button onClick={() => handleTypeSelect('learner')} style={styles.typeBtn}>
                  <span style={{ fontSize: '2rem' }}>🤝</span>
                  <strong>Find a Peer</strong>
                  <span>I need help unblocking a milestone.</span>
                </button>
                <button onClick={() => handleTypeSelect('volunteer')} style={{ ...styles.typeBtn, borderColor: colors.secondary.tomato }}>
                  <span style={{ fontSize: '2rem' }}>🌟</span>
                  <strong>Be a Volunteer</strong>
                  <span>I'm on track and want to help others.</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const styles = {
  container: { fontFamily: fonts.main, minHeight: '100vh', background: '#f8f9fa' },
  hero: { padding: '5rem 2rem', background: colors.primary.berkeleyBlue, color: 'white', textAlign: 'center' },
  mainTitle: { fontSize: '3.5rem', fontWeight: '900', marginBottom: '1rem' },
  heroSub: { fontSize: '1.2rem', opacity: 0.9, maxWidth: '600px', margin: '0 auto' },
  gridSection: { padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto' },
  sectionHeader: { fontSize: '1.8rem', fontWeight: '800', marginBottom: '2.5rem', textAlign: 'center' },
  verticalGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' },
  verticalColumn: { display: 'flex', flexDirection: 'column', gap: '12px' },
  verticalHeader: { fontSize: '0.9rem', fontWeight: '900', letterSpacing: '1.5px', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '10px' },
  programTile: { padding: '20px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', cursor: 'pointer', fontWeight: '700', fontSize: '1.1rem', color: colors.primary.berkeleyBlue, border: '1px solid #eee' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' },
  modalCard: { background: 'white', padding: '2rem', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  closeBtn: { background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer' },
  courseGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  courseBtn: { padding: '15px', borderRadius: '10px', border: '1px solid #eee', background: '#fcfcfc', textAlign: 'left', cursor: 'pointer', fontSize: '1rem', fontWeight: '500' },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' },
  typeBtn: { padding: '30px 20px', borderRadius: '16px', border: '2px solid #eee', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'center' },
  typeSub: { color: '#666', fontSize: '0.9rem', marginBottom: '10px' }
};

export default LandingPage;