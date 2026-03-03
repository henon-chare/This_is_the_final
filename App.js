// App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "./App.css";

// ================= HELPER FUNCTIONS =================
const formatDate = (dateStr) => {
  if (!dateStr) return "Unknown";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    return "Unknown";
  }
};

// PASSWORD VALIDATION HELPER (Mirrors Backend)
const validateReportPassword = (password, username) => {
  if (!password) return { valid: false, msg: "Password cannot be empty." };
  if (password.length < 8) return { valid: false, msg: "Password too short (min 8 chars)." };
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return { valid: false, msg: "Password too similar to username." };
  }
  if (!/[A-Z]/.test(password)) return { valid: false, msg: "Password must contain uppercase." };
  if (!/[a-z]/.test(password)) return { valid: false, msg: "Password must contain lowercase." };
  if (!/\d/.test(password)) return { valid: false, msg: "Password must contain a number." };
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { valid: false, msg: "Password must contain a special character." };
  return { valid: true, msg: "" };
};

// ================= RISK SCORING ALGORITHM =================
const calculateRisk = (manualData, sslStatus) => {
  let score = 0;
  let riskLevel = "Low";
  let color = "var(--status-green)";

  const expDate = new Date(manualData.expirationDate || manualData.apiExpiration);
  const now = new Date();
  
  // FIX: Robust Date Parsing to prevent NaN
  let daysLeft = 0;
  if (expDate && !isNaN(expDate.getTime())) {
      daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
  } else {
      // Default to high risk if date is missing/invalid
      daysLeft = 0; 
  }

  if (daysLeft < 0) {
    score += 80;
  } else if (daysLeft < 30) {
    score += 50;
  } else if (daysLeft < 90) {
    score += 20;
  }

  if (!manualData.autoRenew) {
    score += 30; 
  }

  if (manualData.purpose === "production") {
    score += 10;
  }

  if (sslStatus !== "Valid") {
    score += 20;
  }

  if (manualData.security.mfa) score -= 10;
  if (manualData.security.lock) score -= 10;
  if (manualData.security.dnssec) score -= 5;

  score = Math.max(0, Math.min(100, score));

  if (score >= 60) {
    riskLevel = "Critical";
    color = "var(--status-red)";
  } else if (score >= 30) {
    riskLevel = "Medium";
    color = "var(--status-orange)";
  } else {
    riskLevel = "Low";
    color = "var(--status-green)";
  }

  return { score, riskLevel, color };
};

// ================= PASSWORD MODAL COMPONENT =================
const PasswordModal = ({ isOpen, onClose, onSubmit, title, username }) => {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (errorMsg) setErrorMsg("");
  }, [pwd, confirm, errorMsg]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (pwd !== confirm) {
      setErrorMsg("Passwords do not match!");
      return;
    }

    const strengthCheck = validateReportPassword(pwd, username);
    if (!strengthCheck.valid) {
      setErrorMsg(strengthCheck.msg);
      return;
    }

    onSubmit(pwd);
    setPwd("");
    setConfirm("");
    setErrorMsg("");
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title || "Secure PDF Report"}</h3>
        <p style={{fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "15px"}}>
          Enter a strong password to encrypt the PDF.
        </p>
        
        {errorMsg && (
          <div className="modal-error">
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="modal-input-group">
          <input 
            type="password" 
            placeholder="Enter Password" 
            value={pwd} 
            onChange={(e) => setPwd(e.target.value)} 
            autoFocus
            className={errorMsg ? "input-error" : ""}
          />
          <input 
            type="password" 
            placeholder="Confirm Password" 
            value={confirm} 
            onChange={(e) => setConfirm(e.target.value)} 
            className={errorMsg ? "input-error" : ""}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={handleSubmit} className="btn-submit">Generate PDF</button>
        </div>
      </div>
    </div>
  );
};

// ================= LANDING PAGE COMPONENT =================
const LandingPage = ({ onLogin, onRegister }) => {
  
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page">
      <div className="glow-orb orb-1"></div>
      <div className="glow-orb orb-2"></div>

      <nav className="landing-nav">
        <div className="brand">
          Cyber<span>Guard</span>
        </div>
        <div className="nav-actions">
          <a 
            href="#contact" 
            onClick={(e) => { e.preventDefault(); scrollToSection('contact'); }} 
            className="btn-nav contact"
          >
            Contact Us
          </a>
          <button onClick={onLogin} className="btn-nav login">
            Login
          </button>
          <button onClick={onRegister} className="btn-nav register">
            Register
          </button>
        </div>
      </nav>

      <header className="hero-section">
        <h1 className="hero-title">
          Next-Generation Domain
          <br /> Monitoring & Detection
        </h1>
        <p className="hero-subtitle">
          Unify automated domain intelligence with manual asset governance. Secure your infrastructure with  
              real-time anomaly detection and comprehensive risk reporting.
        </p>
        <div className="cta-group">
            <button 
                onClick={() => scrollToSection('features')} 
                className="btn-large btn-secondary-large" 
                style={{ 
                    background: 'transparent', 
                    border: '1px solid var(--status-blue)',
                    color: 'var(--status-blue)',
                    padding: '16px 48px',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    borderRadius: '2px',
                    transition: '0.2s'
                }}
                onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(6, 182, 212, 0.1)';
                    e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                    e.target.style.background = 'transparent';
                    e.target.style.color = 'var(--status-blue)';
                }}
            >
                Learn More
            </button>
        </div>
      </header>

      <section id="features" className="features-section">
        <div className="section-header">
          <h2>System Capabilities</h2>
          <p>Everything you need to manage your digital presence.</p>
        </div>
        <div className="cards-grid">
          <div className="feature-card">
            <div className="card-icon">📡</div>
            <h3>Auto-Tracking</h3>
            <p>
              Instant updates on domain status, DNS propagation, SSL certs, and WHOIS changes via RDAP.
            </p>
          </div>
          <div className="feature-card">
            <div className="card-icon">📝</div>
            <h3>Manual Asset Mgmt</h3>
            <p>
              Define ownership, purpose, and infrastructure details for domains that lack public data.
            </p>
          </div>
          <div className="feature-card">
            <div className="card-icon">📊</div>
            <h3>Risk Intelligence</h3>
            <p>
              Visual risk scoring based on expiration, compliance checklists, and renewal workflows.
            </p>
          </div>
          
          <div className="feature-card">
            <div className="card-icon">⚡</div>
            <h3>Real-Time Monitoring</h3>
            <p>
              Live HTTP/S uptime tracking with adaptive anomaly detection to catch performance bottlenecks before they cause outages.
            </p>
          </div>
          <div className="feature-card">
            <div className="card-icon">🔒</div>
            <h3>Password Protected Report</h3>
            <p>
              Generate secure, password-protected PDF audit trails and executive summaries for compliance and stakeholders.
            </p>
          </div>
          <div className="feature-card">
            <div className="card-icon">🚨</div>
            <h3>Incident Response</h3>
            <p>
              Detailed incident logging with root cause analysis, downtime duration tracking, and automated alerting workflows.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="contact-section">
        <div className="section-header">
          <h2>Contact Our Developers</h2>
          <p>Connect with the architects behind your digital defense.</p>
        </div>
        <div className="team-grid">
          <div className="team-card">
            <div className="avatar">HC</div>
            <div className="dev-name">Henon Chare</div>
            <div className="dev-role">Lead Developer</div>
            <a href="mailto:henonchare21@gmail.com" className="contact-link email-link">
              📧 henonchare21@gmail.com
            </a>
            <a href="tel:+251982049520" className="contact-link phone-link">
              📞 +251 98 204 9520
            </a>
            <a href="https://github.com/henon-chare" target="_blank" rel="noopener noreferrer" className="contact-link github-link">
              💻 henon-chare
            </a>
          </div>
          <div className="team-card">
            <div className="avatar">BT</div>
            <div className="dev-name">Biniyam Temesgen</div>
            <div className="dev-role">Backend Engineer</div>
            <a href="mailto:biniyamtemesgen40@gmail.com" className="contact-link email-link">
              📧 biniyamtemesgen40@gmail.com
            </a>
            <a href="tel:+251985957185" className="contact-link phone-link">
              📞 +251 98 595 7185
            </a>
            <a href="https://github.com/Bi-ni-yam" target="_blank" rel="noopener noreferrer" className="contact-link github-link">
              💻 Bi-ni-yam
            </a>
          </div>
          <div className="team-card">
            <div className="avatar">MK</div>
            <div className="dev-name">Mikiyas Kindie</div>
            <div className="dev-role">Frontend Specialist</div>
            <a href="mailto:mikiyaskindie6@gmail.com" className="contact-link email-link">
              📧 mikiyaskindie6@gmail.com
            </a>
            <a href="tel:+251948010770" className="contact-link phone-link">
              📞 +251 94 801 0770
            </a>
            <a href="https://github.com/mikii122129" target="_blank" rel="noopener noreferrer" className="contact-link github-link">
              💻 mikii122129
            </a>
          </div>
          <div className="team-card">
            <div className="avatar">AM</div>
            <div className="dev-name">Abinet Melkamu</div>
            <div className="dev-role">System Architect</div>
            <a href="mailto:instaman2124@gmail.com" className="contact-link email-link">
              📧 instaman2124@gmail.com
            </a>
            <a href="tel:+251923248825" className="contact-link phone-link">
              📞 +251 92 324 8825
            </a>
            <a href="https://github.com/abinetbdu" target="_blank" rel="noopener noreferrer" className="contact-link github-link">
              💻 abinetbdu
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        &copy; 2026 Domain Monitoring and Detecting System. All rights reserved.
      </footer>
    </div>
  );
};

// ================= SPARKLINE COMPONENT =================
const Sparkline = ({ history, width = 200, height = 40, isDegraded }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = width;
    const h = height;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    
    if (!history || history.length < 2) return;

    const minVal = Math.min(...history);
    const maxVal = Math.max(...history, minVal + 50);
    const range = maxVal - minVal;
    const stepX = w / (history.length - 1);

    const currentVal = history[history.length - 1];
    const isBad = currentVal > 3000 || currentVal === 0 || isDegraded;
    
    const lineColor = isBad ? "#ef4444" : (currentVal > 1000 ? "#f59e0b" : "#00eaff");

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    if (isBad) {
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.5)");
      gradient.addColorStop(1, "rgba(239, 68, 68, 0)");
    } else {
      gradient.addColorStop(0, "rgba(0, 234, 255, 0.4)");
      gradient.addColorStop(1, "rgba(0, 234, 255, 0)");
    }

    ctx.beginPath();
    history.forEach((val, i) => {
      const x = i * stepX;
      const normalizedY = (val - minVal) / (range || 1); 
      const y = h - (normalizedY * h);
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = (i - 1) * stepX;
        const prevVal = history[i - 1];
        const prevNormalizedY = (prevVal - minVal) / (range || 1);
        const prevY = h - (prevNormalizedY * h);
        const cp1x = prevX + (x - prevX) / 2;
        const cp1y = prevY;
        const cp2x = prevX + (x - prevX) / 2;
        const cp2y = y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
      }
    });

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 10;
    ctx.shadowColor = lineColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

  }, [history, width, height, isDegraded]);

  return (
    <div className="chart-container">
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        style={{ width: "100%", height: "100%", display: "block" }} 
      />
    </div>
  );
};

// ================= UPGRADED DOMAIN TRACKING COMPONENT =================

const ExpiryCountdown = ({ label, dateStr }) => {
  if (!dateStr) return <div className="expiry-badge">N/A</div>;

  const targetDate = new Date(dateStr);
  
  // FIX: Robust check to prevent NaN if date is invalid
  if (isNaN(targetDate.getTime())) return <div className="expiry-badge">Invalid Date</div>;

  const now = new Date();
  const diffTime = targetDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let statusClass = "status-green"; 
  if (diffDays <= 7) statusClass = "status-red";
  else if (diffDays <= 30) statusClass = "status-yellow";

  return (
    <div className={`expiry-info ${statusClass}`}>
      <span className="expiry-label">{label}</span>
      <span className="expiry-days">
        {diffDays < 0 ? "Expired" : `${diffDays} Days`}
      </span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
        ({formatDate(dateStr)})
      </span>
    </div>
  );
};

const DEFAULT_MANUAL_DATA = {
  registrar: "",
  regDate: "",
  expirationDate: "",
  autoRenew: false,
  dnsProvider: "",
  hostingProvider: "",
  sslProvider: "",
  purpose: "production",
  riskLevel: "Medium",
  primaryOwner: "",
  backupOwner: "",
  team: "",
  department: "",
  security: {
    mfa: false,
    lock: false,
    dnssec: false,
    backupContact: false
  },
  notes: []
};

const DomainTrackingComponent = ({ onBack, token, username }) => {
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newDomainInput, setNewDomainInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // UI States
  const [activeDetailTab, setActiveDetailTab] = useState("overview"); 
  const [isEditMode, setIsEditMode] = useState(false);
  const [expandedDns, setExpandedDns] = useState({});
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);

  const [domainManualDataMap, setDomainManualDataMap] = useState({});

  // DERIVED STATE
  const currentManualData = useMemo(() => {
    if (!selectedDomain) return DEFAULT_MANUAL_DATA;
    return domainManualDataMap[selectedDomain.domain_name] || DEFAULT_MANUAL_DATA;
  }, [selectedDomain, domainManualDataMap]);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/domain/list", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
          if (res.status === 401) {
            alert("Session expired. Please login again.");
            window.location.reload();
          }
          setDomains([]);
          setLoading(false);
          return;
      }
      const data = await res.json();
      setDomains(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch domains", err);
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDomains();
    const interval = setInterval(fetchDomains, 60000);
    return () => clearInterval(interval);
  }, [token, fetchDomains]);

  const handleGlobalDomainReport = () => {
    if (!selectedDomain) {
      alert("Please select a domain from the sidebar first to generate a report.");
      return;
    }
    setIsPwdModalOpen(true);
  };

  const downloadReportWithPassword = async (password) => {
    try {
        const res = await fetch(`http://localhost:8000/domain/report/${selectedDomain.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ password: password })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || "Failed to generate report");
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedDomain.domain_name}_report.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error(err);
        alert("Error generating report: " + err.message);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newDomainInput) return;
    setIsAdding(true);
    try {
      const res = await fetch("http://localhost:8000/domain/add", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newDomainInput),
      });
      if (res.ok) {
        const data = await res.json();
        setNewDomainInput("");
        alert(`${data.message}`);
        await fetchDomains();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert("Failed to add domain: " + (errorData.detail || "Unknown error"));
      }
    } catch (err) {
      alert("Error adding domain");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure? This cannot be undone.")) return;

    try {
      const res = await fetch(`http://localhost:8000/domain/${id}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok || res.status === 204) {
        if (selectedDomain?.id === id) {
          setSelectedDomain(null);
          setDetailData(null);
        }
        await fetchDomains();
      } else {
        let errorText = "Failed to delete domain.";
        try {
            const errData = await res.json();
            if (errData.detail) errorText += ` Server says: ${errData.detail}`;
        } catch (e) {
            errorText += ` Server status: ${res.status} ${res.statusText}`;
        }
        alert(errorText);
      }
    } catch (err) {
      console.error(err);
      alert("Network error while deleting. Please check console.");
    }
  };

  const handleSelect = async (domainId) => {
    const domain = domains.find((d) => d.id === domainId);
    setSelectedDomain(domain);
    setExpandedDns({});
    setDetailData(null); 

    try {
      const res = await fetch(`http://localhost:8000/domain/detail/${domainId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch details");
      const data = await res.json();
      
      if (data.manual_data && Object.keys(data.manual_data).length > 0) {
          setDomainManualDataMap(prev => ({
              ...prev,
              [domain.domain_name]: {
                  ...DEFAULT_MANUAL_DATA, 
                  ...data.manual_data     
              }
          }));
      } else {
          setDomainManualDataMap(prev => ({
              ...prev,
              [domain.domain_name]: {
                  ...DEFAULT_MANUAL_DATA,
                  registrar: data.registrar || "",
                  regDate: data.creation_date || "",
                  expirationDate: "", 
                  apiExpiration: data.expiration_date 
              }
          }));
      }

      setTimeout(() => setDetailData(data), 100);
    } catch (err) {
      console.error(err);
      alert("Could not load details.");
      setDetailData(null);
    }
  };

  const handleRescan = async () => {
    if (!selectedDomain) return;
    setIsScanning(true);
    try {
      const res = await fetch(`http://localhost:8000/domain/scan/${selectedDomain.id}`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await handleSelect(selectedDomain.id);
        await fetchDomains();
      } else {
        throw new Error("Scan failed");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Scan failed.");
    } finally {
      setTimeout(() => setIsScanning(false), 1500);
    }
  };

  const toggleDns = (type) => {
    setExpandedDns(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const updateManualField = (key, value) => {
    if (!selectedDomain) return;
    setDomainManualDataMap(prev => ({
      ...prev,
      [selectedDomain.domain_name]: {
        ...(prev[selectedDomain.domain_name] || DEFAULT_MANUAL_DATA),
        [key]: value
      }
    }));
  };

  const updateSecurityField = (key, value) => {
    if (!selectedDomain) return;
    
    const domainName = selectedDomain.domain_name;
    const prevData = domainManualDataMap[domainName] || DEFAULT_MANUAL_DATA;
    
    const newSecurity = {
        ...(prevData.security || DEFAULT_MANUAL_DATA.security),
        [key]: value
    };

    const newManualData = {
        ...prevData,
        security: newSecurity
    };

    setDomainManualDataMap(prev => ({
      ...prev,
      [domainName]: newManualData
    }));

    saveManualData(true, newManualData);
  };

  const saveManualData = async (isSilent = false, manualPayload = null) => {
    if (!selectedDomain) return;
    
    const payload = manualPayload || domainManualDataMap[selectedDomain.domain_name];
    
    try {
        const res = await fetch(`http://localhost:8000/domain/update-manual/${selectedDomain.id}`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to save");
        }
        
        if (!isSilent) {
            setIsEditMode(false);
            alert("Asset Profile Updated & Saved");
        }
    } catch (err) {
        console.error(err);
        if (!isSilent) {
            alert("Error saving data: " + err.message);
        } else {
            console.warn("Silent auto-save failed:", err.message);
        }
    }
  };

  const addNote = () => {
    const text = prompt("Enter note or audit log entry:");
    if (text) {
        const domainName = selectedDomain.domain_name;
        const prevData = domainManualDataMap[domainName] || DEFAULT_MANUAL_DATA;
        const newNotes = [
            ...(prevData.notes || []),
            { date: new Date().toISOString(), text }
        ];
        
        const newManualData = {
            ...prevData,
            notes: newNotes
        };

        setDomainManualDataMap(prev => ({
            ...prev,
            [domainName]: newManualData
        }));

        saveManualData(true, newManualData);
    }
  };

  const riskScoreObj = detailData ? calculateRisk(currentManualData, detailData.ssl_status) : { score: 0, riskLevel: "Unknown", color: "gray" };

  // Helper to get status color for SSL text
  const getSslStatusColor = (status) => {
      if (!status) return "var(--text-muted)";
      const s = status.toLowerCase();
      if (s === 'valid') return 'var(--status-green)';
      if (s.includes('error') || s.includes('timeout') || s === 'expired') return 'var(--status-red)';
      return 'var(--status-orange)';
  };

  return (
    <div className="up-dashboard dashboard-atmosphere" style={{ gridTemplateColumns: "350px 1fr" }}>
      <div className="glow-orb orb-dashboard-1"></div>
      <div className="glow-orb orb-dashboard-2"></div>

      <aside className="up-sidebar">
        <div className="up-sidebar-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
            <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{margin: 0}}>Domain Assets</h2>
                <div className="up-status-badge live">Live Tracking</div>
            </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <form onSubmit={handleAdd} className="up-input-group">
            <input
              type="text"
              placeholder="example.com"
              value={newDomainInput}
              onChange={(e) => setNewDomainInput(e.target.value)}
              disabled={isAdding}
              autoComplete="off"
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                className="up-btn-green glow-effect"
                disabled={isAdding || !newDomainInput.trim()}
                style={{ flex: 1 }}
              >
                {isAdding ? "Adding..." : "Track"}
              </button>
            </div>
          </form>
        </div>

        <div className="up-nav" style={{ marginTop: "20px", padding: 0 }}>
          {domains.map((d) => (
            <div
              key={d.id}
              className={`nav-item domain-card-item interactive-card ${
                selectedDomain?.id === d.id ? "active-glow" : ""
              }`}
              onClick={() => handleSelect(d.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                
                <div className="health-ring-container" title={`Score: ${d.security_score}`}>
                  <div 
                    className="health-ring"
                    style={{
                      background: `conic-gradient(var(--status-blue) ${d.security_score}%, rgba(255,255,255,0.1) 0)`,
                      borderColor: d.security_score > 50 ? "rgba(255,255,255,0.1)" : "var(--status-red)"
                    }}
                  ></div>
                  <div className="health-dot"></div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.domain_name}
                  </div>
                </div>

                <button
                  onClick={(e) => handleDelete(e, d.id)}
                  className="icon-btn-delete"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {domains.length === 0 && !loading && (
            <div className="up-empty-state" style={{border: "none", background: "transparent"}}>
              <p>No domains tracked yet.</p>
            </div>
          )}
        </div>

        <div className="up-footer-nav">
          <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
        </div>
      </aside>

      <main className="up-main">
        {detailData ? (
          <div className="fade-in-content">
            <header className="up-header">
              <div>
                  <div style={{display: "flex", alignItems: "center", gap: "15px"}}>
                    <h3 style={{ margin: 0 }}>{detailData.domain_name}</h3>
                    <div style={{
                        padding: "4px 8px", 
                        background: "rgba(0,0,0,0.3)", 
                        border: "1px solid", 
                        borderColor: riskScoreObj.color,
                        borderRadius: "4px",
                        color: riskScoreObj.color,
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                        textTransform: "uppercase"
                    }}>
                        Risk: {riskScoreObj.riskLevel}
                    </div>
                  </div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Last Scanned: {new Date(detailData.last_scanned).toLocaleString()}
                </span>
              </div>
              
              <div style={{ display: "flex", gap: "10px" }}>
                <button 
                    onClick={handleGlobalDomainReport} 
                    className="up-btn-gray" 
                    style={{ fontSize: "0.8rem" }}
                    title="Generate PDF for this domain only"
                >
                    📄 Domain Report
                </button>
                <button 
                    onClick={handleRescan} 
                    className={`up-btn-blue ${isScanning ? 'scanning-btn' : ''}`} 
                    disabled={isScanning}
                >
                    {isScanning ? "Scanning..." : "🔄 Re-Scan Auto"}
                </button>
              </div>
            </header>

            {isScanning && <div className="scan-overlay"><div className="scan-line"></div></div>}

            <div style={{ display: "flex", gap: "20px", marginBottom: "20px", borderBottom: "1px solid var(--border-color)" }}>
                {['overview', 'asset', 'security'].map(tab => (
                    <div 
                        key={tab}
                        onClick={() => setActiveDetailTab(tab)}
                        style={{
                            padding: "10px 20px",
                            cursor: "pointer",
                            textTransform: "uppercase",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            color: activeDetailTab === tab ? "var(--status-blue)" : "var(--text-muted)",
                            borderBottom: activeDetailTab === tab ? "2px solid var(--status-blue)" : "2px solid transparent",
                            transition: "0.3s"
                        }}
                    >
                        {tab}
                    </div>
                ))}
            </div>

            {activeDetailTab === "overview" && (
                <div className="fade-in-content">
                    <div className="analytics-grid">
                        
                        {(currentManualData.primaryOwner || currentManualData.department) && (
                            <div className="analytics-card glass-card-hover" style={{borderTop: "3px solid var(--status-blue)"}}>
                                <div className="card-header">
                                    <span className="card-icon">👥</span>
                                    <h4>Ownership (Manual)</h4>
                                </div>
                                <div className="card-body">
                                    <div className="status-row">
                                        <span>Primary Owner:</span>
                                        <span style={{fontWeight:"bold", color:"white"}}>{currentManualData.primaryOwner || "---"}</span>
                                    </div>
                                    <div className="status-row">
                                        <span>Backup Owner:</span>
                                        <span>{currentManualData.backupOwner || "---"}</span>
                                    </div>
                                    <div className="status-row">
                                        <span>Department:</span>
                                        <span className="text-glow">{currentManualData.department || "---"}</span>
                                    </div>
                                    <div style={{marginTop: "10px", fontSize: "0.7rem", color: "var(--text-muted)"}}>
                                        * Edit in Asset Profile tab
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="analytics-card glass-card-hover">
                            <div className="card-header">
                                <span className="card-icon">🔒</span>
                                <h4>SSL Certificate (Auto)</h4>
                            </div>
                            <div className="card-body">
                                <div className="status-row">
                                    <span>Status:</span>
                                    <span style={{ color: getSslStatusColor(detailData.ssl_status), fontWeight: 'bold' }}>
                                        {detailData.ssl_status || "Unknown"}
                                    </span>
                                </div>
                                <div className="status-row">
                                    <span>Issuer:</span>
                                    <span className="text-glow">
                                        {detailData.ssl_issuer || "Unknown"}
                                    </span>
                                </div>
                                <div style={{marginTop: "15px"}}>
                                    <ExpiryCountdown label="Expires In" dateStr={detailData.ssl_expires} />
                                </div>
                            </div>
                        </div>

                         {(currentManualData.hostingProvider || currentManualData.dnsProvider) && (
                            <div className="analytics-card glass-card-hover" style={{borderTop: "3px solid var(--status-blue)"}}>
                                <div className="card-header">
                                    <span className="card-icon">🏢</span>
                                    <h4>Providers (Manual)</h4>
                                </div>
                                <div className="card-body">
                                    <div className="status-row">
                                        <span>DNS:</span>
                                        <span style={{fontWeight:"bold"}}>{currentManualData.dnsProvider || "---"}</span>
                                    </div>
                                    <div className="status-row">
                                        <span>Hosting:</span>
                                        <span style={{fontWeight:"bold"}}>{currentManualData.hostingProvider || "---"}</span>
                                    </div>
                                    <div className="status-row">
                                        <span>SSL:</span>
                                        <span>{currentManualData.sslProvider || "---"}</span>
                                    </div>
                                    <div style={{marginTop: "10px", fontSize: "0.7rem", color: "var(--text-muted)"}}>
                                        * Edit in Asset Profile tab
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="analytics-card glass-card-hover">
                            <div className="card-header">
                                <span className="card-icon">📅</span>
                                <h4>Domain Lifecycle</h4>
                            </div>
                            <div className="card-body">
                                <div className="status-row">
                                    <span>Expires:</span>
                                    <span style={{
                                        color: currentManualData.expirationDate ? "var(--status-blue)" : "var(--text-muted)",
                                        fontWeight: currentManualData.expirationDate ? "bold" : "normal"
                                    }}>
                                        {currentManualData.expirationDate ? formatDate(currentManualData.expirationDate) : (detailData.expiration_date ? formatDate(detailData.expiration_date) : "Unknown")}
                                    </span>
                                </div>
                                {currentManualData.expirationDate && (
                                    <div style={{fontSize: "0.7rem", color: "var(--status-orange)", marginBottom: "5px"}}>
                                        Manual Override Set
                                    </div>
                                )}
                                <div className="status-row">
                                    <span>Purpose:</span>
                                    <span style={{
                                        background: "rgba(6, 182, 212, 0.1)", 
                                        padding: "2px 8px", 
                                        borderRadius: "4px",
                                        textTransform: "uppercase",
                                        fontSize: "0.75rem",
                                        fontWeight: "bold"
                                    }}>
                                        {currentManualData.purpose}
                                    </span>
                                </div>
                                <div style={{marginTop: "15px"}}>
                                    <ExpiryCountdown label="Renewal In" dateStr={currentManualData.expirationDate || detailData.expiration_date} />
                                </div>
                            </div>
                        </div>

                        <div className="analytics-card glass-card-hover">
                             <div className="card-header">
                                <span className="card-icon">🩺</span>
                                <h4>Quick Health</h4>
                            </div>
                            <div className="card-body" style={{flexDirection: "column", gap: "12px"}}>
                                <div className="health-item interactive-item">
                                    <span className="health-icon">{detailData.ssl_status === 'Valid' ? '✅' : '⛔'}</span>
                                    <div className="health-text"><strong>SSL Valid</strong></div>
                                </div>
                                <div className="health-item interactive-item">
                                    <span className="health-icon">{detailData.dns_records?.A?.length ? '✅' : '⚠️'}</span>
                                    <div className="health-text"><strong>DNS Resolution</strong></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="up-widget glass-widget" style={{marginTop: "20px"}}>
                      <h4>DNS Infrastructure (Auto)</h4>
                      {detailData.dns_records && Object.keys(detailData.dns_records).length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "15px" }}>
                          {Object.entries(detailData.dns_records).map(([type, records]) => (
                            records.length > 0 && (
                              <div key={type} className="dns-box interactive-dns-box">
                                <div className="dns-type">{type} Records ({records.length})</div>
                                <div className="dns-list">
                                    {records.slice(0, expandedDns[type] ? records.length : 3).map((rec, i) => (
                                        <div key={i} className="dns-item interactive-dns-item">{rec}</div>
                                    ))}
                                    {records.length > 3 && (
                                        <div className="dns-more-btn" onClick={() => toggleDns(type)}>
                                            {expandedDns[type] ? `Show less` : `+ ${records.length - 3} more`}
                                        </div>
                                    )}
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                      ) : (
                        <div className="up-empty-state">No DNS records detected.</div>
                      )}
                    </div>
                </div>
            )}

            {activeDetailTab === "asset" && (
                <div className="fade-in-content" style={{ display: "flex", gap: "20px", flexDirection: "column" }}>
                    <div className="up-widget glass-widget">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h4 style={{ margin: 0 }}>Manual Asset Profile</h4>
                            <button onClick={() => setIsEditMode(!isEditMode)} className="up-btn-blue" style={{ fontSize: "0.7rem", padding: "5px 15px" }}>
                                {isEditMode ? "Cancel" : "Edit Profile"}
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                            <div className="form-section">
                                <h5 style={{ color: "var(--status-blue)", marginBottom: "10px", textTransform: "uppercase", fontSize: "0.8rem" }}>Ownership & Team</h5>
                                <div className="status-row">
                                    <label>Primary Owner</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.primaryOwner} 
                                        onChange={(e) => updateManualField('primaryOwner', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                                <div className="status-row">
                                    <label>Backup Owner</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.backupOwner} 
                                        onChange={(e) => updateManualField('backupOwner', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                                <div className="status-row">
                                    <label>Department</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.department} 
                                        onChange={(e) => updateManualField('department', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                            </div>

                            <div className="form-section">
                                <h5 style={{ color: "var(--status-blue)", marginBottom: "10px", textTransform: "uppercase", fontSize: "0.8rem" }}>Infrastructure Providers</h5>
                                <div className="status-row">
                                    <label>DNS Provider</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.dnsProvider} 
                                        onChange={(e) => updateManualField('dnsProvider', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                                <div className="status-row">
                                    <label>Hosting Provider</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.hostingProvider} 
                                        onChange={(e) => updateManualField('hostingProvider', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                                <div className="status-row">
                                    <label>SSL Provider</label>
                                    <input 
                                        type="text" 
                                        value={currentManualData.sslProvider} 
                                        onChange={(e) => updateManualField('sslProvider', e.target.value)}
                                        disabled={!isEditMode}
                                        style={!isEditMode ? { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" } : {}}
                                    />
                                </div>
                            </div>

                             <div className="form-section">
                                <h5 style={{ color: "var(--status-blue)", marginBottom: "10px", textTransform: "uppercase", fontSize: "0.8rem" }}>Lifecycle & Purpose</h5>
                                <div className="status-row">
                                    <label>Purpose</label>
                                    <select 
                                        value={currentManualData.purpose} 
                                        onChange={(e) => updateManualField('purpose', e.target.value)}
                                        disabled={!isEditMode}
                                        style={isEditMode ? { width: "60%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)" } : { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" }}
                                    >
                                        <option value="production">Production</option>
                                        <option value="staging">Staging</option>
                                        <option value="test">Test</option>
                                        <option value="internal">Internal</option>
                                    </select>
                                </div>
                                <div className="status-row">
                                    <label>Manual Exp. Date</label>
                                    <input 
                                        type="date" 
                                        value={currentManualData.expirationDate} 
                                        onChange={(e) => updateManualField('expirationDate', e.target.value)}
                                        disabled={!isEditMode}
                                        style={isEditMode ? { width: "60%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)" } : { background: "transparent", border: "none", color: "white", textAlign: "right", width: "60%" }}
                                    />
                                </div>
                                <div className="status-row">
                                    <label>Auto-Renew</label>
                                    <input 
                                        type="checkbox" 
                                        checked={currentManualData.autoRenew}
                                        onChange={(e) => updateManualField('autoRenew', e.target.checked)}
                                        disabled={!isEditMode}
                                    />
                                </div>
                            </div>
                        </div>
                        {isEditMode && (
                            <div style={{ marginTop: "20px", textAlign: "right" }}>
                                <button onClick={() => saveManualData(false)} className="up-btn-green">Save Changes</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeDetailTab === "security" && (
                <div className="fade-in-content">
                    <div className="analytics-grid">
                        <div className="analytics-card glass-card-hover" style={{ gridRow: "span 2" }}>
                             <div className="card-header">
                                <span className="card-icon">📊</span>
                                <h4>Calculated Risk Score</h4>
                            </div>
                            <div style={{ textAlign: "center", padding: "20px" }}>
                                <div style={{ 
                                    width: "150px", 
                                    height: "150px", 
                                    borderRadius: "50%", 
                                    border: `10px solid ${riskScoreObj.color}`, 
                                    display: "flex", 
                                    alignItems: "center", 
                                    justifyContent: "center", 
                                    margin: "0 auto 20px",
                                    position: "relative",
                                    boxShadow: `0 0 30px ${riskScoreObj.color}40`
                                }}>
                                    <div>
                                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "white" }}>{riskScoreObj.score}</div>
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/ 100</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: "1.2rem", color: riskScoreObj.color, fontWeight: "bold", textTransform: "uppercase" }}>
                                    {riskScoreObj.riskLevel} RISK
                                </div>
                            </div>
                        </div>

                        <div className="analytics-card glass-card-hover">
                             <div className="card-header">
                                <span className="card-icon">🔐</span>
                                <h4>Security Checklist</h4>
                            </div>
                            <div className="card-body" style={{ flexDirection: "column", gap: "10px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                                    <input type="checkbox" checked={currentManualData.security.mfa} onChange={(e) => updateSecurityField('mfa', e.target.checked)} />
                                    <span>MFA Enabled on Registrar</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                                    <input type="checkbox" checked={currentManualData.security.lock} onChange={(e) => updateSecurityField('lock', e.target.checked)} />
                                    <span>Registrar Lock Active</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                                    <input type="checkbox" checked={currentManualData.security.dnssec} onChange={(e) => updateSecurityField('dnssec', e.target.checked)} />
                                    <span>DNSSEC Enabled</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                                    <input type="checkbox" checked={currentManualData.security.backupContact} onChange={(e) => updateSecurityField('backupContact', e.target.checked)} />
                                    <span>Backup Contact Verified</span>
                                </label>
                            </div>
                        </div>

                         <div className="analytics-card glass-card-hover">
                             <div className="card-header">
                                <span className="card-icon">📝</span>
                                <h4>Audit & Workflow Log</h4>
                            </div>
                            <div style={{ maxHeight: "150px", overflowY: "auto", marginBottom: "10px" }}>
                                {currentManualData.notes.length > 0 ? currentManualData.notes.map((note, i) => (
                                    <div key={i} style={{ fontSize: "0.75rem", marginBottom: "8px", borderBottom: "1px dashed var(--border-color)", paddingBottom: "5px" }}>
                                        <div style={{ color: "var(--status-blue)", fontSize: "0.7rem" }}>{formatDate(note.date)}</div>
                                        <div>{note.text}</div>
                                    </div>
                                )) : <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No notes yet.</div>}
                            </div>
                            <button onClick={addNote} className="up-btn-gray" style={{ fontSize: "0.7rem", width: "100%" }}>+ Add Note / Action</button>
                        </div>
                    </div>
                </div>
            )}

          </div>
        ) : (
          <div className="up-empty-state fade-in-content">
            <div style={{fontSize: "3rem", marginBottom: "20px"}}>🔍</div>
            <h3>Select a domain</h3>
            <p>Choose a domain from sidebar to view detailed analytics, asset management, and risk scoring.</p>
          </div>
        )}
      </main>
      
      <PasswordModal 
        isOpen={isPwdModalOpen} 
        onClose={() => setIsPwdModalOpen(false)} 
        onSubmit={downloadReportWithPassword}
        title="Secure Domain Report"
        username={username}
      />
    </div>
  );
};

// ================= MONITORING COMPONENT =================
const MonitoringComponent = ({ onBack, token, username }) => {
  const [url, setUrl] = useState("");
  const [lastStartedUrl, setLastStartedUrl] = useState("");
  
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("monitoring");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  
  const [selectedMonitor, setSelectedMonitor] = useState(null);
  
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);

  const [data, setData] = useState({
    targets: [],
    current_latencies: {},
    baseline_avgs: {},
    status_messages: {},
    histories: {},
    timestamps: {},
  });

  const isTargetDown = (status, latency) => {
    if (!status) return false;
    const backendDown = 
           status.includes("CRITICAL") || 
           status.includes("ERROR") || 
           status.includes("SERVER DOWN") ||
           status.includes("CONNECTION REFUSED") ||
           status.includes("NOT FOUND (404)") || 
           status.includes("TIMEOUT");           
    return backendDown;
  };

  useEffect(() => {
      const syncBackendState = async () => {
          try {
              const response = await fetch("http://localhost:8000/status", {
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              if (response.ok) {
                  const data = await response.json();
                  if (data.is_monitoring) {
                      setIsMonitoring(true);
                      const activeUrl = data.target_url || (data.targets.length > 0 ? data.targets[0] : "");
                      setUrl(activeUrl);
                      setLastStartedUrl(activeUrl);
                  }
              }
          } catch (error) {
              console.error("Failed to sync with backend:", error);
          }
      };
      syncBackendState();
  }, [token]);

  useEffect(() => {
    let interval;
    if (isMonitoring) {
      interval = setInterval(async () => {
        try {
          const response = await fetch("http://localhost:8000/status", {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.status === 401) {
              clearInterval(interval);
              alert("Session expired");
              window.location.reload();
              return;
          }
          const jsonData = await response.json();
          setData(jsonData);
        } catch (error) {
          console.error("Backend connection lost", error);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isMonitoring, token]);

  const handleGlobalMonitoringReport = () => {
    setIsPwdModalOpen(true);
  };

  const downloadReportWithPassword = async (password) => {
    try {
        const res = await fetch("http://localhost:8000/monitoring/global-report", {
            method: "POST",
            headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ password: password })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || "Failed to generate report");
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `global_session_report.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error(err);
        alert("Error generating report: " + err.message);
    }
  };

  const handleStart = async () => {
    if (!url || !url.startsWith("http")) {
      alert("Please enter a valid URL starting with http/https");
      return;
    }
    setIsLoading(true); 
    const payload = { url: url.trim() };
    try {
      const response = await fetch("http://localhost:8000/start", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          Accept: "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
          if (response.status === 401) {
              alert("Unauthorized");
              return;
          }
          const errorBody = await response.json().catch(() => ({ detail: "No details" }));
          throw new Error(`Backend rejected request (${response.status}): ${errorBody.detail || "Validation error"}`);
      }
      await response.json();
      setIsMonitoring(true);
      setLastStartedUrl(url.trim()); 
    } catch (err) {
      console.error(err);
      alert("Start failed:\n" + (err.message || "Unknown error"));
    } finally {
      setIsLoading(false); 
    }
  };

  const handleResume = () => {
      setUrl(lastStartedUrl); 
      handleStart();           
  };

  const handleStop = async () => {
    try {
      const res = await fetch("http://localhost:8000/stop", { 
          method: "POST",
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(res.statusText);
      setIsMonitoring(false);
    } catch (error) {
      console.error(error);
      alert("Failed to stop: " + error.message);
    }
  };

  const handleClear = () => {
    setData({
      targets: [],
      current_latencies: {},
      baseline_avgs: {},
      status_messages: {},
      histories: {},
      timestamps: {},
    });
    setIsMonitoring(false);
    setSelectedMonitor(null);
    setLastStartedUrl(""); 
  };

  const getFilteredTargets = () => {
    return data.targets.filter((target) => {
      const matchesSearch = target.toLowerCase().includes(searchTerm.toLowerCase());
      const latency = data.current_latencies[target] || 0;
      const status = data.status_messages[target] || "";
      const down = isTargetDown(status, latency);
      
      let matchesFilter = true;
      if (filterStatus === "up") matchesFilter = !down;
      if (filterStatus === "down") matchesFilter = down;

      return matchesSearch && matchesFilter;
    });
  };

  const MonitorDetailView = ({ target }) => {
      const history = data.histories[target] || [];
      const status = data.status_messages[target] || "Idle";
      
      const SLOW_THRESHOLD = 2000;
      const validHistory = history.filter(h => h > 0);
      const validCount = validHistory.length;
      const totalCount = history.length;
      const healthyCount = history.filter(h => h > 0 && h < SLOW_THRESHOLD).length;
      
      const uptimePercent = totalCount > 0 ? ((healthyCount / totalCount) * 100).toFixed(2) : "0.00";
      const avg = validHistory.length ? (validHistory.reduce((a, b) => a + b, 0) / validHistory.length).toFixed(0) : 0;
      const min = validHistory.length ? Math.min(...validHistory).toFixed(0) : 0;
      const max = validHistory.length ? Math.max(...validHistory).toFixed(0) : 0;
      
      const is404 = status.includes("NOT FOUND");
      const down = isTargetDown(status, history[history.length - 1]);
      const isSlow = status.includes("WARNING") || (history.length > 0 && history[history.length-1] > 2000);
      const lastCheck = new Date().toLocaleTimeString();

      return (
          <div className="monitor-detail-container fade-in-content">
              <button onClick={() => setSelectedMonitor(null)} className="back-btn" style={{marginBottom: "20px"}}>
                  ← Back to Dashboard
              </button>

              <div className="up-widget" style={{borderLeft: "5px solid", borderLeftColor: down ? (is404 ? "var(--status-red)" : "var(--status-red)") : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                      <div>
                          <h1 style={{fontSize: "2rem", margin: "0 0 10px 0"}}>{target.replace(/^https?:\/\//, '')}</h1>
                          <div style={{display: "flex", alignItems: "center", gap: "20px"}}>
                              <div style={{fontSize: "2rem", fontWeight: "bold", color: down ? (is404 ? "var(--status-red)" : "var(--status-red)") : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                                  {is404 ? "404 Not Found" : (down ? "DOWN" : (isSlow ? "SLOW RESPONSE" : "UP"))}
                              </div>
                              <div style={{color: "var(--text-muted)", fontSize: "0.9rem"}}>
                                  HTTP/S monitor for {target}
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div style={{textAlign: "right", color: "var(--text-muted)", marginTop: "10px"}}>
                      <div>Last check: {lastCheck}</div>
                      <div>Checked every 1.5s</div>
                  </div>
              </div>

              <div className="analytics-grid" style={{marginTop: "20px"}}>
                  <div className="analytics-card glass-card-hover" style={{gridColumn: "span 3"}}>
                      <div className="card-header">
                          <span className="card-icon">⚡</span>
                          <h4>Response Time (Last Session)</h4>
                      </div>
                      <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginTop: "10px"}}>
                          <div style={{textAlign: "center", padding: "15px", background: "rgba(0,0,0,0.2)", borderRadius: "4px"}}>
                              <div style={{fontSize: "2rem", fontWeight: "bold", color: "var(--status-blue)"}}>{avg} ms</div>
                              <div style={{color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.75rem"}}>Average</div>
                          </div>
                          <div style={{textAlign: "center", padding: "15px", background: "rgba(0,0,0,0.2)", borderRadius: "4px"}}>
                              <div style={{fontSize: "2rem", fontWeight: "bold", color: "var(--status-green)"}}>{min} ms</div>
                              <div style={{color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.75rem"}}>Minimum</div>
                          </div>
                          <div style={{textAlign: "center", padding: "15px", background: "rgba(0,0,0,0.2)", borderRadius: "4px"}}>
                              <div style={{fontSize: "2rem", fontWeight: "bold", color: "var(--status-red)"}}>{max} ms</div>
                              <div style={{color: "var(--text-muted)", textTransform: "uppercase", fontSize: "0.75rem"}}>Maximum</div>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="analytics-grid" style={{marginTop: "20px", gridTemplateColumns: "repeat(4, 1fr)"}}>
                  <div className="analytics-card glass-card-hover">
                      <h4 style={{margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--text-muted)"}}>Current Session</h4>
                      <div style={{fontSize: "1.8rem", fontWeight: "bold"}}>{uptimePercent}%</div>
                      <div style={{fontSize: "0.75rem", color: down ? "var(--status-red)" : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                          {down ? "Ongoing Incident" : (isSlow ? "Performance Issue" : "0 Incidents")}
                      </div>
                  </div>
                  <div className="analytics-card glass-card-hover">
                      <h4 style={{margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--text-muted)"}}>Last 24h (Est.)</h4>
                      <div style={{fontSize: "1.8rem", fontWeight: "bold"}}>{uptimePercent}%</div>
                      <div style={{fontSize: "0.75rem", color: down ? "var(--status-red)" : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                          {down ? "Ongoing Incident" : (isSlow ? "Performance Issue" : "0 Incidents")}
                      </div>
                  </div>
                  <div className="analytics-card glass-card-hover">
                      <h4 style={{margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--text-muted)"}}>Last 30 Days (Est.)</h4>
                      <div style={{fontSize: "1.8rem", fontWeight: "bold"}}>{uptimePercent}%</div>
                      <div style={{fontSize: "0.75rem", color: down ? "var(--status-red)" : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                          {down ? "Ongoing Incident" : (isSlow ? "Performance Issue" : "0 Incidents")}
                      </div>
                  </div>
                  <div className="analytics-card glass-card-hover">
                      <h4 style={{margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--text-muted)"}}>Last 365 Days (Est.)</h4>
                      <div style={{fontSize: "1.8rem", fontWeight: "bold"}}>{uptimePercent}%</div>
                      <div style={{fontSize: "0.75rem", color: down ? "var(--status-red)" : (isSlow ? "var(--status-orange)" : "var(--status-green)")}}>
                          {down ? "Ongoing Incident" : (isSlow ? "Performance Issue" : "0 Incidents")}
                      </div>
                  </div>
              </div>

              <div className="up-widget glass-widget" style={{marginTop: "20px"}}>
                  <div className="card-header">
                      <h4>Response Time History</h4>
                      <span className="text-muted" style={{fontSize: "0.8rem"}}>Last {history.length} checks</span>
                  </div>
                  <div style={{padding: "20px", display: "flex", justifyContent: "center"}}>
                       <Sparkline history={history} width={800} height={200} isDegraded={down} />
                  </div>
              </div>

              <div className="up-widget glass-widget" style={{marginTop: "20px"}}>
                  <h4>Latest Incidents</h4>
                  {down ? (
                      <table style={{width: "100%", textAlign: "left", borderCollapse: "collapse", marginTop: "10px"}}>
                          <thead>
                              <tr style={{borderBottom: "1px solid rgba(255,255,255,0.1)"}}>
                                  <th style={{padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem"}}>Status</th>
                                  <th style={{padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem"}}>Root Cause</th>
                                  <th style={{padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem"}}>Started</th>
                                  <th style={{padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem"}}>Duration</th>
                              </tr>
                          </thead>
                          <tbody>
                              <tr>
                                  <td style={{padding: "10px", color: down ? (is404 ? "var(--status-red)" : "var(--status-red)") : "var(--status-green)", fontWeight: "bold"}}>
                                      {is404 ? "404 Error" : "Down"}
                                  </td>
                                  <td style={{padding: "10px"}}>{status}</td>
                                  <td style={{padding: "10px"}}>{lastCheck}</td>
                                  <td style={{padding: "10px", color: "var(--status-red)"}}>Ongoing...</td>
                              </tr>
                          </tbody>
                      </table>
                  ) : isSlow ? (
                      <div className="up-empty-state" style={{border: "none", background: "transparent", padding: "20px"}}>
                          <p style={{color: "var(--status-orange)"}}>⚠️ High latency detected. Site is responding but slowly.</p>
                      </div>
                  ) : (
                      <div className="up-empty-state" style={{border: "none", background: "transparent", padding: "20px"}}>
                          <p style={{color: "var(--status-green)"}}>✅ No active incidents in the current session.</p>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const renderContent = () => {
    if (selectedMonitor) {
        return <MonitorDetailView target={selectedMonitor} />;
    }

    if (activeTab === "monitoring") {
      const displayTargets = getFilteredTargets();
      return (
        <div className="up-monitors-list hud-grid">
          {displayTargets.length === 0 ? (
            <div className="up-empty-state">
              <p>No monitors found matching your criteria.</p>
            </div>
          ) : (
            displayTargets.map((target) => {
              const history = data.histories[target] || [];
              let latency = data.current_latencies[target] || 0;
              if (latency === 0 && history.length > 0) {
                  latency = history[history.length - 1];
              }

              const status = data.status_messages[target] || "Idle";
              const down = isTargetDown(status, latency);
              
              const is404 = status.includes("NOT FOUND");
              const isSlow = !down && (status.includes("WARNING") || latency > 2000);

              let statusLabel = "Operational";
              let statusClass = "status-up";
              let rowClass = "up"; 
              
              if (is404) {
                  statusLabel = "404 Not Found";
                  statusClass = "status-404";
                  rowClass = "down"; 
              } else if (down) {
                  rowClass = "down";
                  if (status.includes("TIMEOUT")) { 
                      statusLabel = "TIMEOUT"; 
                      statusClass = "status-timeout"; 
                  }
                  else if (status.includes("CRITICAL")) {
                      statusLabel = "CRITICAL"; 
                      statusClass = "status-down"; 
                  }
                  else { 
                      statusLabel = "DOWN"; 
                      statusClass = "status-down"; 
                  }
              } else {
                  if (isSlow) {
                      statusLabel = "SLOW RESPONSE";
                      statusClass = "status-slow"; 
                  } else if (status.includes("Learning")) {
                      statusLabel = "Learning Baseline";
                      statusClass = "status-slow";
                  } else if (status.includes("Unstable")) {
                      statusLabel = "Unstable";
                      statusClass = "status-slow";
                  }
              }

              return (
                <div 
                  key={target} 
                  className={`up-monitor-row ${rowClass}`} 
                  onClick={() => setSelectedMonitor(target)} 
                  style={{cursor: "pointer"}}
                >
                  <div className="hud-corner tl"></div>
                  <div className="hud-corner tr"></div>
                  <div className="hud-corner bl"></div>
                  <div className="hud-corner br"></div>

                  <div className="up-status-icon">
                    <div className={`indicator ${is404 ? "red" : (down ? "red" : (isSlow ? "orange" : "green"))}`}></div>
                  </div>
                  
                  <div className="up-monitor-info">
                    <div className="up-url">{target.replace(/^https?:\/\//, '')}</div>
                    <div className={`up-type ${statusClass}`}>{statusLabel}</div>
                  </div>

                  <div className="up-monitor-chart">
                    <Sparkline history={history} width={200} height={40} isDegraded={down} />
                  </div>

                  <div className="up-monitor-latency">
                    <span className={`badge ${latency > 5000 ? "bad" : "good"}`}>
                      {latency.toFixed(0)} ms
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      );
    } else if (activeTab === "incidents") {
      const incidents = data.targets.filter(t => {
           const latency = data.current_latencies[t] || 0;
           return isTargetDown(data.status_messages[t], latency);
      });

      return (
        <div className="up-monitors-list">
          {incidents.length === 0 ? (
            <div className="up-empty-state" style={{borderColor: "var(--status-blue)"}}>
              <p>Great! No incidents detected.</p>
            </div>
          ) : (
            <>
              <div className="up-widget" style={{marginBottom: "20px", borderLeft: "4px solid var(--status-red)"}}>
                <h4 style={{color: "white", marginBottom: "5px"}}>Active Incidents</h4>
                <p style={{fontSize: "0.9rem", color: "var(--text-muted)"}}>
                  {incidents.length} monitor(s) are currently reporting issues.
                </p>
              </div>
              {incidents.map((target) => {
                const status = data.status_messages[target];
                const latency = data.current_latencies[target] || 0;
                const is404 = status && status.includes("NOT FOUND");
                
                return (
                  <div key={target} className={`up-monitor-row down ${is404 ? 'row-404' : ''}`}>
                    <div className="up-status-icon">
                      <div className={`indicator ${is404 ? "red" : "red"}`}></div>
                    </div>
                    <div className="up-monitor-info">
                      <div className="up-url">{target}</div>
                      <div className="up-type" style={{color: is404 ? "var(--status-red)" : "var(--status-red)"}}>
                          {is404 ? "404 Page Not Found" : (latency > 3000 ? `CRITICAL LAG (${latency.toFixed(0)}ms)` : status)}
                      </div>
                    </div>
                    <div className="up-monitor-uptime">
                      <span className="time-ago">Ongoing</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      );
    }
  };

  const getOverallUptime = () => {
      let totalChecks = 0;
      let upChecks = 0;

      Object.values(data.histories).forEach(history => {
          totalChecks += history.length;
          upChecks += history.filter(h => h > 0).length;
      });

      if (totalChecks === 0) return "N/A";
      return ((upChecks / totalChecks) * 100).toFixed(2) + "%";
  };

  return (
    <div className="up-dashboard">
      <aside className="up-sidebar">
        <div className="up-sidebar-header">
          <h2>CyberGuard</h2>
          <div className={`up-status-badge ${isMonitoring ? "live" : "idle"}`}>
            {isMonitoring ? "● System Active" : "○ System Idle"}
          </div>
        </div>

        <nav className="up-nav">
          <div 
            className={`nav-item ${activeTab === "monitoring" ? "active" : ""}`}
            onClick={() => { setActiveTab("monitoring"); setSelectedMonitor(null); }}
          >
            Monitoring
          </div>
          <div 
            className={`nav-item ${activeTab === "incidents" ? "active" : ""}`}
            onClick={() => setActiveTab("incidents")}
          >
            Incidents
          </div>
        </nav>

     <div className="up-add-monitor">
        <label>Add New Monitor</label>
        <div className="up-input-group">
         <input 
            type="text" 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            disabled={isMonitoring || isLoading} 
            placeholder="https://example.com"
            autoComplete="off"
          />
        
        {!isMonitoring ? (
          <>
              {data.targets.length > 0 ? (
                   <button className="up-btn-resume" onClick={handleResume} disabled={isLoading}>Resume Monitoring</button>
              ) : (
                  <button className="up-btn-green" onClick={handleStart} disabled={isLoading || !url}>
                      {isLoading ? "Starting..." : "Start Monitoring"}
                  </button>
              )}
              <button className="up-btn-gray" onClick={handleClear}>Clear</button>
          </>
        ) : (
            <button className="up-btn-red" onClick={handleStop}>Stop</button>
        )}
    </div>
</div>
      </aside>

      <main className="up-main">
        <header className="up-header">
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
              <h3 style={{textTransform: "capitalize", margin: 0}}>{selectedMonitor ? "Monitor Details" : activeTab.replace("_", " ")}</h3>
              {!selectedMonitor && activeTab === "monitoring" && (
                  <span style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>({data.targets.length})</span>
              )}
          </div>
          
          <div className="up-actions">
            {!selectedMonitor && activeTab === "monitoring" && data.targets.length > 0 && (
                <button onClick={handleGlobalMonitoringReport} className="up-btn-blue" style={{marginRight: "10px"}}>
                    📊 Global Report
                </button>
            )}

            {activeTab === "monitoring" && !selectedMonitor && (
              <>
                <input 
                  type="text" 
                  placeholder="Search monitors..." 
                  className="up-search" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
                <div style={{ position: "relative" }}>
                  <button 
                    className="up-filter-btn" 
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  >
                    {filterStatus === "all" ? "Filter" : filterStatus} ▼
                  </button>
                  {showFilterDropdown && (
                    <div style={{
                      position: "absolute", top: "100%", right: 0, marginTop: "5px", 
                      background: "var(--bg-panel)", border: "1px solid var(--border-color)", 
                      borderRadius: "6px", width: "120px", boxShadow: "0 4px 12px rgba(0,0,0,0.8)",
                      zIndex: 9999, color: "var(--text-main)"
                    }}>
                      <div onClick={() => { setFilterStatus("all"); setShowFilterDropdown(false); }} style={{padding: "8px 12px", cursor: "pointer", color: filterStatus === "all" ? "var(--status-blue)" : "var(--text-main)", fontSize: "0.9rem"}}>All</div>
                      <div onClick={() => { setFilterStatus("up"); setShowFilterDropdown(false); }} style={{padding: "8px 12px", cursor: "pointer", color: filterStatus === "up" ? "var(--status-blue)" : "var(--text-main)", fontSize: "0.9rem"}}>Up</div>
                      <div onClick={() => { setFilterStatus("down"); setShowFilterDropdown(false); }} style={{padding: "8px 12px", cursor: "pointer", color: filterStatus === "down" ? "var(--status-blue)" : "var(--text-main)", fontSize: "0.9rem"}}>Down</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {renderContent()}
      </main>

      {activeTab === "monitoring" && !selectedMonitor && (
        <aside className="up-right-panel">
          <div className="up-widget current-status">
            <h4>Current status</h4>
            <div className="status-grid">
              {(() => {
                  let down = 0;
                  let up = 0;
                  data.targets.forEach(t => {
                      if(isTargetDown(data.status_messages[t], data.current_latencies[t])) down++;
                      else up++;
                  });
                  return (
                      <>
                          <div className="status-item">
                              <span className="label">Down</span>
                              <span className="val red">{down}</span>
                          </div>
                          <div className="status-item">
                              <span className="label">Up</span>
                              <span className="val green">{up}</span>
                          </div>
                          <div className="status-item">
                              <span className="label">Paused</span>
                              <span className="val gray">{0}</span>
                          </div>
                      </>
                  )
              })()}
            </div>
          </div>

          <div className="up-widget last-hours">
            <h4>Last 24 hours</h4>
            <div className="stat-row">
              <span className="lbl">Overall uptime</span>
              <span className="val">{getOverallUptime()}</span>
            </div>
            <div className="stat-row">
              <span className="lbl">Incidents</span>
              <span className="val">{data.targets.filter(t => isTargetDown(data.status_messages[t], data.current_latencies[t])).length}</span>
            </div>
            <div className="stat-row">
              <span className="lbl">Without incid.</span>
              <span className="val">{data.targets.length - data.targets.filter(t => isTargetDown(data.status_messages[t], data.current_latencies[t])).length}</span>
            </div>
            <div className="stat-row">
              <span className="lbl">Affected mon.</span>
              <span className="val">{data.targets.filter(t => isTargetDown(data.status_messages[t], data.current_latencies[t])).length}</span>
            </div>
          </div>
          
          <div className="up-footer-nav">
            <button onClick={onBack} className="back-btn">← Back to Dashboard</button>
          </div>
        </aside>
      )}

      <PasswordModal 
        isOpen={isPwdModalOpen} 
        onClose={() => setIsPwdModalOpen(false)} 
        onSubmit={downloadReportWithPassword}
        title="Secure Monitoring Report"
        username={username}
      />
    </div>
  );
};

// ================= ALERT DASHBOARD COMPONENT (UPDATED) =================
const AlertDashboardComponent = ({ onBack, token }) => {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState("all");

  // NEW: Domains list for customization
  const [domains, setDomains] = useState([]);

  // New Rule Form State
  const [newRule, setNewRule] = useState({
    name: "",
    type: "service",
    target_id: null, // Track specific domain ID
    condition: "status_down",
    threshold: "",
    severity: "warning",
    channel: "email"
  });

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, histRes] = await Promise.all([
        fetch("http://localhost:8000/alerts/rules", {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch("http://localhost:8000/alerts/history?limit=50", {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (rulesRes.ok) setRules(await rulesRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch (e) {
      console.error("Failed to load alerts", e);
    } finally {
      setLoading(false);
    }
  };

  // NEW: Fetch Domains when opening modal or component mounts if needed
  const fetchDomains = async () => {
    try {
      const res = await fetch("http://localhost:8000/domain/list", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDomains(await res.json());
      }
    } catch (e) {
      console.error("Failed to load domains", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Fetch domains when modal opens to populate dropdown
  useEffect(() => {
    if (showAddModal) {
      fetchDomains();
    }
  }, [showAddModal, token]);

  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:8000/alerts/rules", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(newRule)
      });
      
      if (res.ok) {
        setShowAddModal(false);
        fetchData();
        // Reset form
        setNewRule({
          name: "",
          type: "service",
          target_id: null,
          condition: "status_down",
          threshold: "",
          severity: "warning",
          channel: "email"
        });
      } else {
        alert("Failed to create alert rule.");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating rule.");
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Delete this alert rule?")) return;
    try {
      const res = await fetch(`http://localhost:8000/alerts/rules/${id}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        fetchData(); 
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${errorData.detail || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Network error while deleting rule.");
    }
  };

  const getSeverityColor = (sev) => {
    if (sev === "critical") return "var(--status-red)";
    if (sev === "high") return "var(--status-orange)";
    if (sev === "warning") return "#fbbf24"; 
    return "var(--status-blue)";
  };

  const getSeverityBadge = (sev) => {
      const color = getSeverityColor(sev);
      return (
        <span style={{
            background: `${color}20`,
            color: color,
            border: `1px solid ${color}`,
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            fontWeight: "bold"
        }}>
            {sev}
        </span>
      )
  };

  const filteredHistory = history.filter(h => 
    filterSeverity === "all" ? true : h.severity === filterSeverity
  );

  // NEW: Determine Overall System Alert Level (High Level Feature)
  const getSystemAlertLevel = () => {
      const severities = history.map(h => h.severity);
      if (severities.includes('critical')) return { text: "CRITICAL ALERT", color: "var(--status-red)" };
      if (severities.includes('high')) return { text: "HIGH ALERT", color: "var(--status-orange)" };
      if (severities.includes('warning')) return { text: "Warning Active", color: "#fbbf24" };
      if (severities.includes('info')) return { text: "System Normal", color: "var(--status-blue)" };
      return { text: "System Normal", color: "var(--status-blue)" };
  };

  const systemStatus = getSystemAlertLevel();

  if (loading) return <div style={{padding: "20px", color: "var(--text-muted)"}}>Loading Alert Command Center...</div>;

  return (
    <div className="up-dashboard dashboard-atmosphere" style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
      <div className="glow-orb orb-dashboard-1"></div>
      <div className="glow-orb orb-dashboard-2"></div>

      <header className="dashboard-header" style={{ position: 'relative', top: 0, padding: '20px 40px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--status-red)', textShadow: '0 0 10px rgba(239, 68, 68, 0.5)', margin: 0 }}>Alert Dashboard</h1>
          <div style={{ fontSize: '0.8rem', color: systemStatus.color, fontWeight: 'bold', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {systemStatus.text}
          </div>
        </div>
        <button onClick={onBack} className="up-btn-gray" style={{ fontSize: '0.8rem' }}>← Back to Home</button>
      </header>

      <main style={{ padding: '0 40px 40px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* UPDATED: Top Stats Row with Info and High Cards */}
        <div className="analytics-grid" style={{ marginBottom: '30px' }}>
            {/* Info Card - Interactive */}
            <div className="analytics-card glass-card-hover" 
                 style={{borderLeft: "4px solid var(--status-blue)", cursor: "pointer", transition: "0.2s"}}
                 onClick={() => setFilterSeverity("info")}
                 onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-5px)"}
                 onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
                <div className="card-header">
                    <span className="card-icon">ℹ️</span>
                    <h4>Info Logs</h4>
                </div>
                <div style={{fontSize: "2.5rem", fontWeight: "bold", color: "white"}}>{history.filter(h => h.severity === 'info').length}</div>
                <div style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>General updates</div>
            </div>

            {/* Warning Card - Interactive */}
            <div className="analytics-card glass-card-hover" 
                 style={{borderLeft: "4px solid var(--status-orange)", cursor: "pointer"}}
                 onClick={() => setFilterSeverity("warning")}
            >
                <div className="card-header">
                    <span className="card-icon">⚠️</span>
                    <h4>Warnings (24h)</h4>
                </div>
                <div style={{fontSize: "2.5rem", fontWeight: "bold", color: "var(--status-orange)"}}>
                    {history.filter(h => h.severity === 'warning').length}
                </div>
                <div style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>Performance alerts</div>
            </div>

            {/* High Card - NEW & Interactive */}
            <div className="analytics-card glass-card-hover" 
                 style={{borderLeft: "4px solid #ff5722", cursor: "pointer"}}
                 onClick={() => setFilterSeverity("high")}
            >
                <div className="card-header">
                    <span className="card-icon">🔥</span>
                    <h4>High Priority</h4>
                </div>
                <div style={{fontSize: "2.5rem", fontWeight: "bold", color: "#ff5722"}}>
                    {history.filter(h => h.severity === 'high').length}
                </div>
                <div style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>Severe issues</div>
            </div>

            {/* Critical Card - Interactive */}
            <div className="analytics-card glass-card-hover" 
                 style={{borderLeft: "4px solid var(--status-red)", cursor: "pointer"}}
                 onClick={() => setFilterSeverity("critical")}
            >
                <div className="card-header">
                    <span className="card-icon">🚨</span>
                    <h4>Critical (24h)</h4>
                </div>
                <div style={{fontSize: "2.5rem", fontWeight: "bold", color: "var(--status-red)", animation: "pulse-red 2s infinite"}}>
                    {history.filter(h => h.severity === 'critical').length}
                </div>
                <div style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>Immediate action required</div>
            </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "30px" }}>
            
            {/* Left Column: Rules Management */}
            <div className="up-widget glass-widget">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h4 style={{ margin: 0 }}>Alert Rules</h4>
                    <button onClick={() => setShowAddModal(true)} className="up-btn-blue" style={{ fontSize: "0.8rem", padding: "8px 16px" }}>
                        + New Rule
                    </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                    {rules.length === 0 ? (
                        <div className="up-empty-state" style={{ padding: "40px 0", fontSize: "0.9rem" }}>
                            No alert rules configured.
                        </div>
                    ) : (
                        rules.map(rule => (
                            <div key={rule.id} style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.05)",
                                padding: "15px",
                                borderRadius: "4px",
                                position: "relative",
                                transition: "0.2s"
                            }} className="interactive-card">
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                    <div style={{ fontWeight: "bold", fontSize: "1rem" }}>{rule.name}</div>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        {getSeverityBadge(rule.severity)}
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation(); 
                                                handleDeleteRule(rule.id);
                                            }}
                                            title="Delete Rule"
                                            style={{ 
                                                background: "none", 
                                                border: "none", 
                                                color: "var(--text-muted)", 
                                                cursor: "pointer", 
                                                fontSize: "1.2rem", 
                                                lineHeight: 1,
                                                padding: "0 5px"
                                            }}
                                        >×</button>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                    <div><strong>Type:</strong> {rule.type}</div>
                                    <div><strong>Condition:</strong> {rule.condition.replace(/_/g, ' ')}</div>
                                    <div><strong>Channel:</strong> <span style={{ textTransform: "capitalize", color: "var(--status-blue)" }}>{rule.channel}</span></div>
                                    <div><strong>Active:</strong> {rule.is_active ? "Yes" : "No"}</div>
                                </div>
                                {rule.threshold && (
                                    <div style={{ marginTop: "8px", fontSize: "0.8rem", color: "var(--status-orange)" }}>
                                        Threshold: {rule.threshold}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Column: History Log */}
            <div className="up-widget glass-widget">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h4 style={{ margin: 0 }}>Alert History</h4>
                    <select 
                        value={filterSeverity} 
                        onChange={(e) => setFilterSeverity(e.target.value)}
                        style={{ background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)", padding: "5px 10px", borderRadius: "2px", fontSize: "0.8rem" }}
                    >
                        <option value="all">All Levels</option>
                        <option value="critical">Critical Only</option>
                        <option value="high">High Only</option>
                        <option value="warning">Warning Only</option>
                        <option value="info">Info Only</option>
                    </select>
                </div>

                <div style={{ maxHeight: "500px", overflowY: "auto", paddingRight: "5px" }}>
                    {filteredHistory.length === 0 ? (
                        <div className="up-empty-state" style={{ padding: "40px 0", fontSize: "0.9rem" }}>
                            No recent alerts found.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                            {filteredHistory.map((alert, idx) => (
                                <div key={alert.id} style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "15px",
                                    padding: "12px 0",
                                    borderBottom: idx === filteredHistory.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)"
                                }}>
                                    {/* Timeline Dot */}
                                    <div style={{ position: "relative", paddingTop: "6px" }}>
                                        <div style={{
                                            width: "10px", height: "10px", borderRadius: "50%",
                                            background: getSeverityColor(alert.severity),
                                            boxShadow: `0 0 10px ${getSeverityColor(alert.severity)}`
                                        }}></div>
                                        {idx !== filteredHistory.length - 1 && (
                                            <div style={{
                                                position: "absolute", top: "16px", left: "4.5px", bottom: "-16px",
                                                width: "1px", background: "rgba(255,255,255,0.1)"
                                            }}></div>
                                        )}
                                    </div>
                                    
                                    {/* Content */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                            <span style={{ fontWeight: "bold", color: "var(--text-main)", fontSize: "0.9rem" }}>
                                                {alert.message || "System Alert"}
                                            </span>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                {new Date(alert.triggered_at || alert.time).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", gap: "10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                            <span>Via: <span style={{ textTransform: "capitalize", color: "white" }}>{alert.channel}</span></span>
                                            <span>Status: <span style={{ color: alert.status === 'sent' ? 'var(--status-green)' : 'var(--status-red)' }}>{alert.status}</span></span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
      </main>

      {/* Add Rule Modal with Customization */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: "500px" }}>
            <h3>Create Alert Rule</h3>
            <form onSubmit={handleCreateRule} style={{ marginTop: "20px" }}>
                <div className="status-row">
                    <label>Rule Name</label>
                    <input 
                        type="text" 
                        required
                        value={newRule.name} 
                        onChange={e => setNewRule({...newRule, name: e.target.value})}
                        style={{ background: "rgba(0,0,0,0.5)", border: "1px solid var(--border-color)", color: "white", padding: "8px", borderRadius: "2px", width: "60%" }}
                    />
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "15px" }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "5px" }}>Target Type</label>
                        <select 
                            value={newRule.type}
                            onChange={e => setNewRule({...newRule, type: e.target.value, target_id: null})}
                            style={{ width: "100%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "2px" }}
                        >
                            <option value="service">Service Monitor</option>
                            <option value="domain">Domain Asset</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "5px" }}>Severity</label>
                        <select 
                            value={newRule.severity}
                            onChange={e => setNewRule({...newRule, severity: e.target.value})}
                            style={{ width: "100%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "2px" }}
                        >
                            <option value="info">Info</option>
                            <option value="warning">Warning</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                </div>

                {/* NEW: Domain Customization */}
                {newRule.type === "domain" && (
                    <div style={{ marginTop: "15px" }}>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "5px" }}>Target Domain</label>
                        <select 
                            value={newRule.target_id || ""}
                            onChange={e => setNewRule({...newRule, target_id: e.target.value ? parseInt(e.target.value) : null})}
                            style={{ width: "100%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "2px" }}
                        >
                            <option value="">All Domains</option>
                            {domains.map(d => (
                                <option key={d.id} value={d.id}>{d.domain_name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ marginTop: "15px" }}>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "5px" }}>Trigger Condition</label>
                    <select 
                        value={newRule.condition}
                        onChange={e => setNewRule({...newRule, condition: e.target.value})}
                        style={{ width: "100%", background: "var(--bg-dark)", color: "white", border: "1px solid var(--border-color)", padding: "8px", borderRadius: "2px" }}
                    >
                        {newRule.type === "domain" ? (
                            <>
                                <option value="ssl_expiring">SSL Certificate Expiring</option>
                                <option value="domain_expiring">Domain Expiring</option>
                                <option value="dns_failure">DNS Resolution Failure</option>
                            </>
                        ) : (
                            <>
                                <option value="status_down">Service Status Down</option>
                                <option value="response_time_high">Response Time High</option>
                            </>
                        )}
                    </select>
                </div>

                <div className="status-row" style={{ marginTop: "15px" }}>
                    <label>Threshold (Optional)</label>
                    <input 
                        type="text" 
                        placeholder={newRule.type === "domain" ? "e.g. < 30 days" : "e.g. > 500ms"}
                        value={newRule.threshold} 
                        onChange={e => setNewRule({...newRule, threshold: e.target.value})}
                        style={{ background: "rgba(0,0,0,0.5)", border: "1px solid var(--border-color)", color: "white", padding: "8px", borderRadius: "2px", width: "60%" }}
                    />
                </div>

                <div style={{ marginTop: "15px" }}>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "5px" }}>Notification Channel</label>
                    <div style={{ display: "flex", gap: "10px" }}>
                        {['email', 'sms', 'webhook'].map(ch => (
                            <label key={ch} style={{ 
                                background: newRule.channel === ch ? "var(--status-blue)" : "rgba(255,255,255,0.05)",
                                color: newRule.channel === ch ? "black" : "var(--text-muted)",
                                padding: "8px 16px", 
                                borderRadius: "4px", 
                                cursor: "pointer", 
                                fontSize: "0.8rem",
                                textTransform: "capitalize",
                                border: "1px solid var(--border-color)"
                            }}>
                                <input type="radio" name="channel" value={ch} checked={newRule.channel === ch} onChange={() => setNewRule({...newRule, channel: ch})} style={{ display: "none" }} />
                                {ch}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="modal-actions" style={{ marginTop: "25px" }}>
                    <button type="button" onClick={() => setShowAddModal(false)} className="btn-cancel">Cancel</button>
                    <button type="submit" className="btn-submit">Create Rule</button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= MAIN APP COMPONENT =================
function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [page, setPage] = useState("login");
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    token: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState(null); 
  const [selectedCard, setSelectedCard] = useState(null);
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/reset-password/")) {
      const tokenFromUrl = path.split("/")[2];
      if (tokenFromUrl) {
        setFormData(prev => ({ ...prev, token: tokenFromUrl }));
        setPage("reset");
        setShowLanding(false);
      }
    }
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    if (page === "register" || page === "reset") {
      if (formData.password !== confirmPassword) {
        setMessage("Passwords do not match.");
        return;
      }
    }
    let url = "";
    let body = {};
    if (page === "login") {
      url = "http://localhost:8000/login";
      body = { username: formData.username, password: formData.password };
    } else if (page === "register") {
      url = "http://localhost:8000/register";
      body = { username: formData.username, email: formData.email, password: formData.password };
    } else if (page === "forgot") {
      url = "http://localhost:8000/forgot-password";
      body = { email: formData.email };
    } else if (page === "reset") {
      url = "http://localhost:8000/reset-password";
      body = { token: formData.token, new_password: formData.password, username: formData.username };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        if (page === "login") {
          if (data.access_token) {
            setAuthToken(data.access_token);
            localStorage.setItem('auth_token', data.access_token);
          }
          setUserLoggedIn(true);
          setSelectedCard(null);
          setShowLanding(false);
        } else if (page === "register") {
          setTimeout(() => { setPage("login"); setMessage("Registration successful! Please login."); }, 1500);
        } else if (page === "reset") {
          setTimeout(() => { setPage("login"); setMessage("Password reset successful! Please login."); }, 2000);
        }
      } else {
        let errorMessage = "Error occurred";
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map((err) => err.msg).join(", ");
          } else {
            errorMessage = data.detail;
          }
        } else {
          errorMessage = JSON.stringify(data);
        }
        setMessage(errorMessage);
      }
    } catch (err) {
      setMessage("Server not reachable");
    }
  };

  const HomePage = () => {
    if (selectedCard === "monitoring") {
      return <MonitoringComponent onBack={() => setSelectedCard(null)} token={authToken} username={formData.username} />;
    }
    if (selectedCard === "domains") {
      return <DomainTrackingComponent onBack={() => setSelectedCard(null)} token={authToken} username={formData.username} />;
    }
    if (selectedCard === "alerts") {
      return <AlertDashboardComponent onBack={() => setSelectedCard(null)} token={authToken} />;
    }
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>CyberGuard</h1>
          
          <div className="profile-wrapper" ref={profileRef}>
            <div className="profile-trigger" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <div className="profile-icon-circle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <span className="profile-label">Profile</span>
                <span className="chevron">▼</span>
            </div>

            {isProfileOpen && (
                <div className="profile-dropdown">
                    <div className="profile-header">
                        <div className="avatar-large">
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                        <div className="user-info">
                            <h3>{formData.username || "User"}</h3>
                            <p>{formData.email || formData.username || "user@cyberguard.ai"}</p>
                        </div>
                    </div>
                    <div className="profile-divider"></div>
                    <div className="profile-stats">
                        <div className="stat-item">
                            <span className="stat-label">Status</span>
                            <span className="stat-value text-green">Active</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Role</span>
                            <span className="stat-value">Admin</span>
                        </div>
                    </div>
                    <div className="profile-divider"></div>
                    <button className="profile-logout-btn" onClick={() => { 
                        setUserLoggedIn(false); 
                        setShowLanding(true);
                        setAuthToken(null);
                        localStorage.removeItem('auth_token');
                        setIsProfileOpen(false);
                    }}>
                        Logout
                    </button>
                </div>
            )}
          </div>
        </header>
        <section className="hero">
          <h2>Security Operations Center</h2>
          <p>Monitor • Detect • Protect • Respond</p>
        </section>
        <section className="cards">
          <div className="card" onClick={() => setSelectedCard("monitoring")}>
            <span className="icon">🌐</span>
            <h3>Website Monitoring</h3>
            <p>Track uptime, response time, and anomalies in real time.</p>
          </div>
          <div className="card" onClick={() => setSelectedCard("domains")}>
            <span className="icon">🔍</span>
            <h3>Domain Tracking</h3>
            <p>Deep DNS inspection, SSL monitoring, and domain reputation.</p>
          </div>
          <div className="card" onClick={() => setSelectedCard("alerts")}>
            <span className="icon">🚨</span>
            <h3>Alert Dashboard</h3>
            <p>Manage notification rules, view incident history, and configure alerts.</p>
          </div>
          <div className="card">
            <span className="icon">🛡️</span>
            <h3>Threat Detection</h3>
            <p>Identify vulnerabilities and suspicious activities.</p>
          </div>
        </section>
      </div>
    );
  };

  if (showLanding) return <LandingPage 
    onLogin={() => { setShowLanding(false); setPage("login"); }} 
    onRegister={() => { setShowLanding(false); setPage("register"); }} 
  />;

  if (userLoggedIn) return <HomePage />;

  return (
    <div className="app-auth">
      <div className="container">
        <h1>CyberGuard</h1>
        <div style={{ marginBottom: "20px", color: "#94a3b8", cursor: "pointer", textDecoration: "underline" }} onClick={() => setShowLanding(true)}>
          &larr; Back to Home
        </div>
        {message && <div className="message">{message}</div>}
        <form onSubmit={handleSubmit} className="form" autoComplete="off">
          {(page === "register" || page === "login") && (
            <input 
              type="text" 
              name="username" 
              placeholder="Username" 
              value={formData.username} 
              onChange={handleChange} 
              required 
              autoComplete="off" 
            />
          )}
          {(page === "register" || page === "forgot") && (
            <input 
              type="email" 
              name="email" 
              placeholder="Email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
              autoComplete="off" 
            />
          )}
          {(page === "login" || page === "register" || page === "reset") && (
            <div className="password-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                name="password" 
                placeholder={page === "reset" ? "New Password" : "Password"} 
                value={formData.password} 
                onChange={handleChange} 
                required 
                autoComplete="new-password" 
              />
              <span className="eye-icon" onClick={() => setShowPassword(!showPassword)} role="button" tabIndex="0">{showPassword ? "🔐" : "🔓"}</span>
            </div>
          )}
          {(page === "register" || page === "reset") && (
            <div className="password-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                name="confirmPassword" 
                placeholder="Confirm Password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required 
                autoComplete="new-password" 
              />
              <span className="eye-icon" onClick={() => setShowPassword(!showPassword)} role="button" tabIndex="0">{showPassword ? "🔐" : "🔓"}</span>
            </div>
          )}
          {page === "reset" && (
            <>
              <input type="text" name="username" placeholder="Username" value={formData.username} onChange={handleChange} required autoComplete="off" />
              <input type="text" name="token" placeholder="Reset Token (Check Email)" value={formData.token} onChange={handleChange} required autoComplete="off" />
            </>
          )}
          <button type="submit">{page === "login" && "Login"}{page === "register" && "Register"}{page === "forgot" && "Send Reset Email"}{page === "reset" && "Reset Password"}</button>
        </form>
        <div className="links">
          {page !== "login" && <p onClick={() => { setPage("login"); setMessage(""); setConfirmPassword(""); }}>Login</p>}
          {page !== "register" && <p onClick={() => { setPage("register"); setMessage(""); setConfirmPassword(""); }}>Register</p>}
          {page !== "forgot" && <p onClick={() => { setPage("forgot"); setMessage(""); setConfirmPassword(""); }}>Forgot Password</p>}
          {page !== "reset" && page === "forgot" && <p onClick={() => { setPage("reset"); setMessage(""); setConfirmPassword(""); }}>Reset Password</p>}
        </div>
      </div>
    </div>
  );
}

export default App;