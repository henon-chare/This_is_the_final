# monitor.py
import asyncio
import time
from typing import List, Dict
import httpx
import socket
from urllib.parse import urlparse

# IMPORTS FOR DATABASE & ALERTS
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Monitor, AlertRule, AlertHistory
from database import DATABASE_URL, Base

# Create a local engine for the monitoring thread
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class SmartDetector:
    """
    Uses Exponentially Weighted Moving Average (EWMA) for adaptive anomaly detection.
    """
    def __init__(self, alpha=0.2, threshold=2.5):
        self.alpha = alpha  # Smoothing factor
        self.threshold = threshold # Standard deviations
        self.ema = 0.0  
        self.emsd = 1.0  # Exponential Moving Standard Deviation
        self.is_initialized = False
        self.consecutive_anomalies = 0
        self.required_failures = 3  # Need 3 bad pings in a row

    def update(self, new_value):
        if not self.is_initialized:
            self.ema = new_value
            self.is_initialized = True
            return "TRAINING", False
        
        # Update EMA
        self.ema = self.alpha * new_value + (1 - self.alpha) * self.ema
        # Update EMSD
        diff = abs(new_value - self.ema)
        self.emsd = self.alpha * diff + (1 - self.alpha) * self.emsd
        
        if self.emsd == 0:
            self.emsd = 0.001
        z_score = (new_value - self.ema) / self.emsd
        
        # Decision Logic
        if z_score > self.threshold:
            self.consecutive_anomalies += 1
            if self.consecutive_anomalies >= self.required_failures:
                # CHANGED: "DOWN" -> "SLOW RESPONSE" (Warning, not Fatal)
                return "WARNING: Slow Response", True
            else:
                return "Unstable", False
        else:
            self.consecutive_anomalies = 0
            return "UP", False

class MonitorState:
    def __init__(self):
        self.is_monitoring = False
        self.target_url: str = ""
        self.targets: List[str] = []
        self.detectors: Dict[str, SmartDetector] = {}
        self.histories: Dict[str, List[float]] = {}
        self.timestamps: Dict[str, List[float]] = {}
        self.baseline_avgs: Dict[str, float] = {}
        self.current_statuses: Dict[str, str] = {}
        self.http_status_codes: Dict[str, int] = {}
        self.previous_statuses: Dict[str, str] = {}

# ================= ALERT LOGIC =================
def evaluate_threshold(current_value, threshold_str):
    """
    Parses ">100ms" and returns True if current_value > 100.
    """
    try:
        clean = threshold_str.lower().replace('ms', '').replace('s', '').strip()
        operator = '>'
        limit = 0.0
        
        if clean.startswith('>='):
            operator = '>='
            limit = float(clean[2:])
        elif clean.startswith('>'):
            operator = '>'
            limit = float(clean[1:])
        elif clean.startswith('<='):
            operator = '<='
            limit = float(clean[2:])
        elif clean.startswith('<'):
            operator = '<'
            limit = float(clean[1:])
        else:
            # Default
            operator = '>'
            limit = float(clean)

        if operator == '>=':
            return current_value >= limit
        elif operator == '>':
            return current_value > limit
        elif operator == '<=':
            return current_value <= limit
        elif operator == '<':
            return current_value < limit
            
    except ValueError:
        return False
    return False

async def check_and_trigger_alerts(target_url: str, latency_ms: float, status: str):
    """
    Checks DB for rules and creates alerts if conditions are met.
    """
    db = SessionLocal()
    try:
        # 1. Find the Monitor entry for this URL
        monitor = db.query(Monitor).filter(Monitor.target_url == target_url).first()
        
        if not monitor:
            return 

        # 2. Get Active Rules for this User
        rules = db.query(AlertRule).filter(
            AlertRule.user_id == monitor.user_id,
            AlertRule.is_active == True
        ).all()

        for rule in rules:
            # If rule is specific to one monitor, ensure it matches
            if rule.target_id is not None and rule.target_id != monitor.id:
                continue

            triggered = False
            message = ""

            # 3. Check Response Time Condition
            if rule.condition == "response_time_high":
                if latency_ms > 0: # Only trigger if we have a response
                    if evaluate_threshold(latency_ms, rule.threshold):
                        triggered = True
                        message = f"High Latency Alert: {target_url} is {latency_ms:.0f}ms (Threshold: {rule.threshold})"

            # 4. Check Status Down Condition
            elif rule.condition == "status_down":
                is_down = (
                    "DOWN" in status or 
                    "ERROR" in status or 
                    "REFUSED" in status or 
                    "404" in status or 
                    "TIMEOUT" in status
                )
                if is_down:
                    triggered = True
                    message = f"Service Down Alert: {target_url} is {status}"

            # 5. Create Alert in DB
            if triggered:
                print(f"[ALERT TRIGGERED] {message}") 
                new_alert = AlertHistory(
                    user_id=monitor.user_id,
                    rule_id=rule.id,
                    source_type="service",
                    source_id=monitor.id,
                    message=message,
                    severity=rule.severity,
                    channel=rule.channel,
                    status="sent"
                )
                db.add(new_alert)
                db.commit()

    except Exception as e:
        print(f"[ALERT ERROR] {e}")
        db.rollback()
    finally:
        db.close()
# ================= END ALERT LOGIC =================

async def monitoring_loop(state: MonitorState):
    headers = {
        'User-Agent': 'Mozilla/5.0 (ServerPulse-AI/2.0; +https://serverpulse.ai)'
    }
    while state.is_monitoring:
        for target in state.targets:
            try:
                start_time = time.time()
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                    response = await client.head(target, headers=headers)
                duration_ms = (time.time() - start_time) * 1000
                state.http_status_codes[target] = response.status_code
                
                # --- UPDATED HTTP LOGIC ---
                if response.status_code >= 500:
                    state.current_statuses[target] = f"SERVER DOWN ({response.status_code})"
                    update_history(state, target, 0)
                elif response.status_code == 404:
                    state.current_statuses[target] = "NOT FOUND (404)"
                    update_history(state, target, 0) 
                elif 400 <= response.status_code < 500:
                    state.current_statuses[target] = f"WARNING ({response.status_code})"
                    update_history(state, target, 0)
                else:
                    status_text, is_anomaly = state.detectors[target].update(duration_ms)
                    if status_text == "TRAINING":
                        state.current_statuses[target] = "Learning Baseline..."
                    elif status_text == "WARNING: Slow Response":
                        state.current_statuses[target] = "WARNING: High Latency"
                    elif status_text == "Unstable":
                        state.current_statuses[target] = "Unstable"
                    else:
                        state.current_statuses[target] = "Operational"
                    update_history(state, target, duration_ms)
                    
            except httpx.ConnectTimeout:
                state.current_statuses[target] = "TIMEOUT (Firewall/Net)"
                update_history(state, target, 0)
                
            except httpx.ConnectError:
                state.current_statuses[target] = "CONNECTION REFUSED"
                update_history(state, target, 0)
                
            except Exception as e:
                state.current_statuses[target] = f"ERROR: {str(e)[:20]}"
                update_history(state, target, 0)

            # --- IMPORTANT: CALL ALERT LOGIC ---
            await check_and_trigger_alerts(target, state.histories[target][-1] if target in state.histories else 0, state.current_statuses[target])

        await asyncio.sleep(1.5) 

def update_history(state: MonitorState, target: str, val: float):
    if target not in state.histories:
        state.histories[target] = []
        state.timestamps[target] = []
    state.histories[target].append(val)
    state.timestamps[target].append(time.time())
    state.baseline_avgs[target] = state.detectors[target].ema
    if len(state.histories[target]) > 50:
        state.histories[target].pop(0)
        state.timestamps[target].pop(0)