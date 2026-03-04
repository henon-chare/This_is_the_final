# monitor.py
import asyncio
import time
from typing import List, Dict
import httpx
import socket
from urllib.parse import urlparse
from datetime import datetime

# ADDED IMPORTS FOR DATABASE LOGGING
from database import SessionLocal
from models import Incident, Monitor

class SmartDetector:
    """
    Uses Exponentially Weighted Moving Average (EWMA) for adaptive anomaly detection.
    """
    def __init__(self, alpha=0.2, threshold=2.5):
        self.alpha = alpha 
        self.threshold = threshold
        self.ema = 0.0  
        self.emsd = 1.0 
        self.is_initialized = False
        self.consecutive_anomalies = 0
        self.required_failures = 3 

    def update(self, new_value):
        if not self.is_initialized:
            self.ema = new_value
            self.is_initialized = True
            return "TRAINING", False
        
        self.ema = self.alpha * new_value + (1 - self.alpha) * self.ema
        diff = abs(new_value - self.ema)
        self.emsd = self.alpha * diff + (1 - self.alpha) * self.emsd
        
        if self.emsd == 0:
            self.emsd = 0.001
        z_score = (new_value - self.ema) / self.emsd
        
        if z_score > self.threshold:
            self.consecutive_anomalies += 1
            if self.consecutive_anomalies >= self.required_failures:
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
        # ADDED: Track previous status to detect transitions (UP -> DOWN)
        self.previous_statuses: Dict[str, str] = {}

# ADDED FUNCTION: Handles DB writing for incidents
async def handle_incident_logic(target: str, state: MonitorState):
    current_status = state.current_statuses.get(target, "Idle")
    previous_status = state.previous_statuses.get(target, "Idle")
    
    # Helper to determine if "DOWN"
    # We consider TIMEOUT, REFUSED, 404, and 5xx errors as "Down"
    is_down = (
        "DOWN" in current_status or 
        "ERROR" in current_status or 
        "REFUSED" in current_status or 
        "404" in current_status or 
        "TIMEOUT" in current_status
    )
    
    was_down = (
        "DOWN" in previous_status or 
        "ERROR" in previous_status or 
        "REFUSED" in previous_status or 
        "404" in previous_status or 
        "TIMEOUT" in previous_status
    )

    # CASE 1: Transition from UP to DOWN -> Create Incident
    if is_down and not was_down:
        db = SessionLocal()
        try:
            # Find the monitor ID associated with this URL
            monitor = db.query(Monitor).filter(Monitor.target_url == target).first()
            if monitor:
                new_incident = Incident(
                    monitor_id=monitor.id,
                    status="Ongoing",
                    error_type=current_status,
                    started_at=datetime.utcnow()
                )
                db.add(new_incident)
                db.commit()
                print(f"[DB] Incident STARTED for {target}")
        except Exception as e:
            print(f"[DB Error] Failed to create incident: {e}")
            db.rollback()
        finally:
            db.close()

    # CASE 2: Transition from DOWN to UP -> Close Incident
    elif not is_down and was_down:
        db = SessionLocal()
        try:
            # Find the monitor ID
            monitor = db.query(Monitor).filter(Monitor.target_url == target).first()
            if monitor:
                # Find the most recent 'Ongoing' incident for this monitor
                incident = db.query(Incident).filter(
                    Incident.monitor_id == monitor.id,
                    Incident.status == "Ongoing"
                ).order_by(Incident.started_at.desc()).first()
                
                if incident:
                    incident.status = "Resolved"
                    incident.ended_at = datetime.utcnow()
                    incident.duration_seconds = int((incident.ended_at - incident.started_at).total_seconds())
                    db.commit()
                    print(f"[DB] Incident RESOLVED for {target} (Duration: {incident.duration_seconds}s)")
        except Exception as e:
            print(f"[DB Error] Failed to close incident: {e}")
            db.rollback()
        finally:
            db.close()

    # Update previous state for next loop
    state.previous_statuses[target] = current_status

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
                    # Server Error
                    state.current_statuses[target] = f"SERVER DOWN ({response.status_code})"
                    # FIX: Send 0 to mark as DOWN in history
                    update_history(state, target, 0)
                elif response.status_code == 404:
                    # Specific 404 Handling
                    state.current_statuses[target] = "NOT FOUND (404)"
                    # FIX: Send 0 to mark as DOWN in history (404 is a hard failure for uptime)
                    update_history(state, target, 0) 
                elif 400 <= response.status_code < 500:
                    # Other Client Errors (403, 401, etc.)
                    state.current_statuses[target] = f"WARNING ({response.status_code})"
                    # FIX: Send 0 to mark as DOWN/Unhealthy in history. 
                    # Access denied means the monitor couldn't validate content.
                    update_history(state, target, 0)
                else:
                    # 2xx/3xx OK
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

            # --- ADDED: CALL INCIDENT LOGIC ---
            # This checks if the status changed and updates the DB accordingly
            await handle_incident_logic(target, state)

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